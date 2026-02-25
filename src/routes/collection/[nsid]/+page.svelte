<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { listReposByCollection, listRecords, listAllRecords, getProfiles, type AtRecord, type BskyProfile } from '$lib/at-client.js';
  import GardenStyle from '$lib/components/GardenStyle.svelte';

  type UserRow = {
    did: string;
    profile: BskyProfile | null;
    recordCount: number | null;
    hasMore: boolean;
    countLoading: boolean;
    countError: string | null;
    subjectDid?: string | null;
    subjectProfile?: BskyProfile | null;
  };

  let nsid = $derived(page.params.nsid ?? '');

  let dids = $state<string[]>([]);
  let rows = $state<UserRow[]>([]);
  let reposLoading = $state(true);
  let reposError = $state<string | null>(null);
  let profilesLoading = $state(false);
  let countsLoading = $state(false);

  let viewMode = $state<'table' | 'grid' | 'subjects' | 'latest' | 'lineage'>('table');

  // All-records state for subject-based views (lazy loaded)
  let allRecords = $state<AtRecord[]>([]);
  let allRecordsLoading = $state(false);
  let allRecordsLoaded = $state(false);
  let allRecordsError = $state<string | null>(null);
  let sporeSubjectProfiles = $state<Map<string, BskyProfile | null>>(new Map());

  $effect(() => {
    void loadCollection(nsid);
  });

  // Trigger full record load when switching to a subject-based view
  $effect(() => {
    const isSporeView = viewMode === 'subjects' || viewMode === 'latest' || viewMode === 'lineage';
    const ready = dids.length > 0 && !reposLoading;
    if (isSporeView && ready && !allRecordsLoaded && !allRecordsLoading) {
      void loadAllSporeRecords();
    }
  });

  async function loadCollection(collection: string) {
    dids = [];
    rows = [];
    reposLoading = true;
    reposError = null;
    profilesLoading = false;
    countsLoading = false;
    allRecords = [];
    allRecordsLoading = false;
    allRecordsLoaded = false;
    allRecordsError = null;
    sporeSubjectProfiles = new Map();

    // Step 1: Get all DIDs
    let fetchedDids: string[];
    try {
      fetchedDids = await listReposByCollection(collection);
    } catch (err) {
      reposError = err instanceof Error ? err.message : String(err);
      reposLoading = false;
      return;
    }

    dids = fetchedDids;
    reposLoading = false;

    if (fetchedDids.length === 0) return;

    // Step 2: Fetch profiles in batches
    profilesLoading = true;
    rows = fetchedDids.map((did) => ({
      did,
      profile: null,
      recordCount: null,
      hasMore: false,
      countLoading: true,
      countError: null
    }));

    let profileMap: Map<string, BskyProfile | null>;
    try {
      profileMap = await getProfiles(fetchedDids);
    } catch {
      profileMap = new Map();
    }

    rows = rows.map((r) => ({ ...r, profile: profileMap.get(r.did) ?? null }));
    profilesLoading = false;

    // Step 3: Fetch record counts and identify subjects in parallel
    countsLoading = true;
    const countPromises = fetchedDids.map((did, i) =>
      listRecords(did, collection, { limit: 1 })
        .then((resp) => {
          const firstRec = resp.records[0];
          const subject = (firstRec?.value as any)?.subject;
          const sDid = typeof subject === 'string' ? subject : (subject?.did as string | undefined);

          rows[i] = {
            ...rows[i],
            recordCount: resp.records.length,
            hasMore: !!resp.cursor,
            countLoading: false,
            subjectDid: sDid
          };
        })
        .catch((err: Error) => {
          rows[i] = {
            ...rows[i],
            countLoading: false,
            countError: err.message
          };
        })
    );

    await Promise.all(countPromises);
    countsLoading = false;

    // Step 4: Fetch subject profiles
    const subjectDids = [...new Set(rows.map((r) => r.subjectDid).filter(Boolean) as string[])];
    if (subjectDids.length > 0) {
      try {
        const sProfileMap = await getProfiles(subjectDids);
        rows = rows.map((r) => ({
          ...r,
          subjectProfile: r.subjectDid ? sProfileMap.get(r.subjectDid) ?? null : null
        }));
      } catch (err) {
        console.error('Failed to fetch subject profiles:', err);
      }
    }
  }

  async function loadAllSporeRecords() {
    if (allRecordsLoading || allRecordsLoaded) return;
    allRecordsLoading = true;
    allRecordsError = null;

    const currentNsid = nsid;

    // Load all records from all users in parallel
    const collected: AtRecord[] = [];
    await Promise.all(
      dids.map(async (did) => {
        try {
          const recs = await listAllRecords(did, currentNsid);
          collected.push(...recs);
        } catch (err) {
          console.warn(`Failed to load records for ${did}:`, err);
        }
      })
    );

    allRecords = collected;

    // Fetch subject profiles for all subjects found
    const subjectDids = new Set<string>();
    for (const rec of collected) {
      const sdid = getRecordSubjectDid(rec);
      if (sdid) subjectDids.add(sdid);
    }
    if (subjectDids.size > 0) {
      try {
        sporeSubjectProfiles = await getProfiles([...subjectDids]);
      } catch (err) {
        console.error('Failed to fetch spore subject profiles:', err);
      }
    }

    allRecordsLoaded = true;
    allRecordsLoading = false;
  }

  // ── Derived: author profiles from rows (already fetched during collection load)
  let authorProfiles = $derived.by(() => {
    const m = new Map<string, BskyProfile | null>();
    for (const r of rows) m.set(r.did, r.profile);
    return m;
  });

  // ── Derived: per-user table rows sorted by record count desc
  let sortedRows = $derived(
    [...rows].sort((a, b) => {
      const ac = a.recordCount ?? -1;
      const bc = b.recordCount ?? -1;
      return bc - ac;
    })
  );

  // ── Derived: allRecords grouped by subject DID
  // groups: [subjectDid, AtRecord[]][] sorted by latest record desc
  // noSubject: records without a subject field
  let sporeGroups = $derived.by(() => {
    const groups = new Map<string, AtRecord[]>();
    const noSubject: AtRecord[] = [];

    for (const rec of allRecords) {
      const sdid = getRecordSubjectDid(rec);
      if (!sdid) { noSubject.push(rec); continue; }
      if (!groups.has(sdid)) groups.set(sdid, []);
      groups.get(sdid)!.push(rec);
    }

    // Sort within each group chronologically ascending (oldest first)
    for (const recs of groups.values()) {
      recs.sort((a, b) => (getRecordCreatedAt(a) ?? '').localeCompare(getRecordCreatedAt(b) ?? ''));
    }

    // Sort groups by latest record descending
    const sorted = [...groups.entries()].sort((a, b) => {
      const ta = getRecordCreatedAt(a[1].at(-1)!) ?? '';
      const tb = getRecordCreatedAt(b[1].at(-1)!) ?? '';
      return tb.localeCompare(ta);
    });

    noSubject.sort((a, b) => (getRecordCreatedAt(a) ?? '').localeCompare(getRecordCreatedAt(b) ?? ''));

    return { groups: sorted, noSubject };
  });

  // ── Helpers

  function getRecordSubjectDid(record: AtRecord): string | null {
    const subject = (record.value as any).subject;
    return typeof subject === 'string' ? subject : (subject?.did as string | undefined) ?? null;
  }

  function getRecordCreatedAt(record: AtRecord): string | null {
    const val = record.value;
    if (typeof val.createdAt === 'string') return val.createdAt;
    if (typeof val.$createdAt === 'string') return val.$createdAt;
    return null;
  }

  function extractAuthorDid(uri: string): string {
    return uri.split('/')[2] ?? '';
  }

  function formatDate(iso: string): string {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function rkey(uri: string): string {
    return uri.split('/').at(-1) ?? uri;
  }

  function displayHandle(row: UserRow): string {
    if (row.profile?.displayName) return row.profile.displayName;
    if (row.profile?.handle) return '@' + row.profile.handle;
    return row.did.slice(0, 24) + '…';
  }

  function shortDid(did: string): string {
    return did.length > 32 ? did.slice(0, 20) + '…' + did.slice(-8) : did;
  }

  function displayProfileName(p: BskyProfile | null | undefined, fallbackDid: string): string {
    if (p?.displayName) return p.displayName;
    if (p?.handle) return '@' + p.handle;
    return fallbackDid.slice(0, 20) + '…';
  }
</script>

<a class="back" href="{base}/">← BACK TO DASHBOARD</a>

<div class="page-title">{nsid.split('.').pop() ?? nsid}</div>
<div class="page-subtitle" style="text-transform: none;">{nsid}</div>

{#if reposLoading}
  <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--muted); font-weight: 700;">
    <span class="spinner"></span>
    FETCHING REPO LIST FROM RELAY...
  </div>
{:else if reposError}
  <div class="error" style="font-weight: 700;">ERROR: {reposError}</div>
{:else if dids.length === 0}
  <div style="color: var(--muted); font-weight: 700;">NO REPOSITORIES FOUND FOR THIS COLLECTION.</div>
{:else}
  <div style="margin-bottom: 2rem; display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
    <span class="card" style="padding: 0.5rem 1rem; box-shadow: 2px 2px 0px 0px black;">
      <strong style="font-size: 1.5rem;">{dids.length}</strong>
      <span style="color: var(--muted); margin-left: 0.5rem; font-weight: 700; text-transform: uppercase; font-size: 12px;">
        {dids.length === 1 ? 'user' : 'users'}
      </span>
    </span>
    {#if profilesLoading}
      <span style="color: var(--muted); font-size: 13px; font-weight: 700;"><span class="spinner"></span> LOADING PROFILES...</span>
    {/if}
    {#if countsLoading}
      <span style="color: var(--muted); font-size: 13px; font-weight: 700;"><span class="spinner"></span> COUNTING RECORDS...</span>
    {/if}

    <div style="flex: 1; display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap;">
      <button
        onclick={() => viewMode = 'table'}
        style="padding: 0.4rem 0.8rem; font-size: 12px; background: {viewMode === 'table' ? 'var(--accent)' : 'var(--surface2)'}; color: {viewMode === 'table' ? 'white' : 'var(--text)'};"
      >TABLE</button>
      <button
        onclick={() => viewMode = 'grid'}
        style="padding: 0.4rem 0.8rem; font-size: 12px; background: {viewMode === 'grid' ? 'var(--accent)' : 'var(--surface2)'}; color: {viewMode === 'grid' ? 'white' : 'var(--text)'};"
      >GRID</button>
      <div style="width: 1px; background: var(--border-dark); margin: 0 0.1rem; align-self: stretch;"></div>
      <button
        onclick={() => viewMode = 'subjects'}
        style="padding: 0.4rem 0.8rem; font-size: 12px; background: {viewMode === 'subjects' ? 'var(--fg, #111)' : 'var(--surface2)'}; color: {viewMode === 'subjects' ? 'var(--bg, #fff)' : 'var(--text)'};"
      >SUBJECTS</button>
      <button
        onclick={() => viewMode = 'latest'}
        style="padding: 0.4rem 0.8rem; font-size: 12px; background: {viewMode === 'latest' ? 'var(--fg, #111)' : 'var(--surface2)'}; color: {viewMode === 'latest' ? 'var(--bg, #fff)' : 'var(--text)'};"
      >LATEST</button>
      <button
        onclick={() => viewMode = 'lineage'}
        style="padding: 0.4rem 0.8rem; font-size: 12px; background: {viewMode === 'lineage' ? 'var(--fg, #111)' : 'var(--surface2)'}; color: {viewMode === 'lineage' ? 'var(--bg, #fff)' : 'var(--text)'};"
      >LINEAGE</button>
    </div>
  </div>

  <!-- ── TABLE VIEW ─────────────────────────────────────────── -->
  {#if viewMode === 'table'}
    <table>
      <thead>
        <tr>
          <th style="width: 60px;">Style</th>
          <th>User</th>
          <th>DID</th>
          <th style="text-align: right;">Records</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedRows as row}
          <tr>
            <td>
              <GardenStyle did={row.subjectDid || row.did} size={32} isSpore={nsid.includes('specialSpore')} />
            </td>
            <td>
              <div class="user-cell">
                {#if row.profile?.avatar}
                  <img class="avatar" src={row.profile.avatar} alt="" loading="lazy" />
                {:else}
                  <div class="avatar-placeholder"></div>
                {/if}
                <span style="font-weight: 700; overflow: hidden; text-overflow: ellipsis;">{displayHandle(row)}</span>
              </div>
            </td>
            <td>
              <code class="mono" style="font-size: 11px; color: var(--muted); border: none; background: transparent; padding: 0;" title={row.did}>
                {shortDid(row.did)}
              </code>
            </td>
            <td style="text-align: right;">
              {#if row.countLoading}
                <span class="spinner"></span>
              {:else if row.countError}
                <span class="error" title={row.countError}>ERR</span>
              {:else}
                <span class="badge {(row.recordCount ?? 0) > 0 ? 'badge-blue' : 'badge-muted'}" style="font-size: 13px; padding: 0.25rem 0.6rem;">
                  {row.recordCount}{row.hasMore ? '+' : ''}
                </span>
              {/if}
            </td>
            <td style="text-align: right;">
              <a
                href="{base}/user/{encodeURIComponent(row.did)}/{encodeURIComponent(nsid)}"
                style="font-size: 13px; white-space: nowrap; font-weight: 700; text-transform: uppercase;"
              >
                View records →
              </a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

  <!-- ── GRID VIEW ──────────────────────────────────────────── -->
  {:else if viewMode === 'grid'}
    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.5rem;">
      {#each sortedRows as row}
        <a class="card" href="{base}/user/{encodeURIComponent(row.did)}/{encodeURIComponent(nsid)}" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; text-decoration: none; color: inherit; border-radius: 4px;">
          <div style="height: 100px; width: 100%; overflow: hidden;">
            <GardenStyle did={row.subjectDid || row.did} size={100} isSpore={nsid.includes('specialSpore')} />
          </div>
          <div style="padding: 0.4rem; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; border-top: 1px solid var(--border-dark);">
            <div style="display: flex; align-items: center; gap: 0.3rem;">
              {#if row.profile?.avatar}
                <img class="avatar" src={row.profile.avatar} alt="" style="width: 16px; height: 16px; border-radius: 2px;" />
              {:else}
                <div class="avatar-placeholder" style="width: 16px; height: 16px; border-radius: 2px;"></div>
              {/if}
              <div style="font-weight: 800; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                {row.profile?.displayName || row.profile?.handle || row.did.slice(0, 12)}
              </div>
            </div>
            {#if row.subjectDid}
              <div style="font-size: 8px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 0.2rem;">
                <span style="opacity: 0.7;">FROM</span>
                <span style="overflow: hidden; text-overflow: ellipsis;">
                  {row.subjectProfile?.handle || row.subjectProfile?.displayName || row.subjectDid.slice(0, 16)}
                </span>
              </div>
            {/if}
          </div>
        </a>
      {/each}
    </div>

  <!-- ── SUBJECT-BASED VIEWS: loading gate ─────────────────── -->
  {:else if allRecordsLoading}
    <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--muted); font-weight: 700;">
      <span class="spinner"></span>
      LOADING ALL RECORDS...
    </div>

  {:else if allRecordsError}
    <div class="error" style="font-weight: 700;">ERROR: {allRecordsError}</div>

  {:else if viewMode === 'subjects'}
    <!-- ── SUBJECTS VIEW ─────────────────────────────────────── -->
    <div style="margin-bottom: 1rem; color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
      {sporeGroups.groups.length} unique subject{sporeGroups.groups.length === 1 ? '' : 's'} · {allRecords.length} total records
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem;">
      {#each sporeGroups.groups as [subjectDid, groupRecords]}
        {@const subjectProfile = sporeSubjectProfiles.get(subjectDid) ?? null}
        {@const senderDids = [...new Set(groupRecords.map(r => extractAuthorDid(r.uri)))]}
        <div class="card" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
          <div style="height: 120px; width: 100%; overflow: hidden;">
            <GardenStyle did={subjectDid} size={160} isSpore={nsid.includes('specialSpore')} />
          </div>
          <div style="padding: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; border-top: var(--border-width) solid var(--border-dark);">
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              {#if subjectProfile?.avatar}
                <img src={subjectProfile.avatar} alt="" style="width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--border-dark); flex-shrink: 0;" />
              {:else}
                <div class="avatar-placeholder" style="width: 18px; height: 18px; border-radius: 3px; flex-shrink: 0;"></div>
              {/if}
              <div style="font-weight: 800; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {subjectProfile?.displayName || (subjectProfile?.handle ? '@' + subjectProfile.handle : subjectDid.slice(0, 18) + '…')}
              </div>
            </div>
            <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
              <span style="font-size: 10px; font-weight: 700; background: var(--surface); border: 1px solid var(--border-dark); padding: 0.1rem 0.4rem; border-radius: 2px;">
                {groupRecords.length} record{groupRecords.length === 1 ? '' : 's'}
              </span>
              <span style="font-size: 10px; font-weight: 700; color: var(--muted); background: var(--surface); border: 1px solid var(--border-dark); padding: 0.1rem 0.4rem; border-radius: 2px;">
                {senderDids.length} sender{senderDids.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

  {:else if viewMode === 'latest'}
    <!-- ── LATEST VIEW ───────────────────────────────────────── -->
    <div style="margin-bottom: 1rem; color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
      {sporeGroups.groups.length} unique subject{sporeGroups.groups.length === 1 ? '' : 's'}
    </div>
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      {#each sporeGroups.groups as [subjectDid, groupRecords]}
        {@const latest = groupRecords.at(-1)!}
        {@const subjectProfile = sporeSubjectProfiles.get(subjectDid) ?? null}
        {@const authorDid = extractAuthorDid(latest.uri)}
        {@const authorProfile = authorProfiles.get(authorDid) ?? null}
        {@const createdAt = getRecordCreatedAt(latest)}
        <div class="card" style="padding: 1rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <!-- Subject -->
          <div style="display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 180px;">
            <div style="width: 40px; height: 40px; flex-shrink: 0; overflow: hidden; border-radius: 4px;">
              <GardenStyle did={subjectDid} size={40} isSpore={nsid.includes('specialSpore')} />
            </div>
            {#if subjectProfile?.avatar}
              <img src={subjectProfile.avatar} alt="" style="width: 22px; height: 22px; border-radius: 3px; border: 1px solid var(--border-dark); flex-shrink: 0;" />
            {:else}
              <div class="avatar-placeholder" style="width: 22px; height: 22px; flex-shrink: 0;"></div>
            {/if}
            <div style="font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              {displayProfileName(subjectProfile, subjectDid)}
            </div>
            {#if groupRecords.length > 1}
              <span style="font-size: 10px; font-weight: 700; color: var(--muted); background: var(--surface); border: 1px solid var(--border-dark); padding: 0.1rem 0.4rem; border-radius: 2px; flex-shrink: 0;">
                {groupRecords.length}×
              </span>
            {/if}
          </div>

          <!-- Latest record info -->
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <code class="mono" style="font-size: 11px; color: var(--accent); border: none; background: transparent; padding: 0; font-weight: 700;">{rkey(latest.uri)}</code>
            {#if createdAt}
              <span style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase;">{formatDate(createdAt)}</span>
            {/if}
          </div>

          <!-- Sender -->
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em;">by</span>
            {#if authorProfile?.avatar}
              <img src={authorProfile.avatar} alt="" style="width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--border-dark);" />
            {:else}
              <div class="avatar-placeholder" style="width: 18px; height: 18px;"></div>
            {/if}
            <span style="font-size: 12px; font-weight: 700;">{displayProfileName(authorProfile, authorDid)}</span>
          </div>
        </div>
      {/each}
    </div>

  {:else if viewMode === 'lineage'}
    <!-- ── LINEAGE VIEW ──────────────────────────────────────── -->
    <div style="margin-bottom: 1rem; color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
      {sporeGroups.groups.length} unique subject{sporeGroups.groups.length === 1 ? '' : 's'} · {allRecords.length} total records
    </div>
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      {#each sporeGroups.groups as [subjectDid, groupRecords]}
        {@const subjectProfile = sporeSubjectProfiles.get(subjectDid) ?? null}
        <div class="card" style="padding: 1.5rem;">
          <!-- Group header -->
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: var(--border-width) solid var(--border-dark);">
            <div style="width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 4px;">
              <GardenStyle did={subjectDid} size={48} isSpore={nsid.includes('specialSpore')} />
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;">
              {#if subjectProfile?.avatar}
                <img src={subjectProfile.avatar} alt="" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-dark); flex-shrink: 0;" />
              {:else}
                <div class="avatar-placeholder" style="width: 24px; height: 24px; flex-shrink: 0;"></div>
              {/if}
              <div style="font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {displayProfileName(subjectProfile, subjectDid)}
              </div>
            </div>
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface); border: var(--border-width) solid var(--border-dark); padding: 0.2rem 0.6rem; border-radius: var(--border-radius); flex-shrink: 0; box-shadow: var(--shadow-neobrutal);">
              {groupRecords.length} record{groupRecords.length === 1 ? '' : 's'}
            </div>
          </div>

          <!-- Timeline -->
          <div style="position: relative; padding-left: 24px;">
            <div style="position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--border-dark);"></div>
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              {#each groupRecords as record, i}
                {@const createdAt = getRecordCreatedAt(record)}
                {@const isLatest = i === groupRecords.length - 1}
                {@const authorDid = extractAuthorDid(record.uri)}
                {@const authorProfile = authorProfiles.get(authorDid) ?? null}
                <div style="position: relative;">
                  <div style="position: absolute; left: -21px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; border-radius: 50%; background: {isLatest ? 'var(--accent)' : 'var(--border-dark)'}; border: 2px solid var(--bg);"></div>
                  <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.75rem; border-radius: var(--border-radius); background: {isLatest ? 'var(--surface)' : 'transparent'}; border: {isLatest ? 'var(--border-width) solid var(--border-dark)' : '1px solid transparent'}; {isLatest ? 'box-shadow: var(--shadow-neobrutal);' : ''}">
                    <code class="mono" style="color: var(--accent); font-weight: 700; border: none; background: transparent; padding: 0; font-size: 12px;">{rkey(record.uri)}</code>
                    {#if createdAt}
                      <span style="color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase;">{formatDate(createdAt)}</span>
                    {/if}
                    <!-- Sender -->
                    <div style="display: flex; align-items: center; gap: 0.3rem; margin-left: 0.25rem;">
                      <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--muted);">by</span>
                      {#if authorProfile?.avatar}
                        <img src={authorProfile.avatar} alt="" style="width: 16px; height: 16px; border-radius: 2px; border: 1px solid var(--border-dark);" />
                      {:else}
                        <div class="avatar-placeholder" style="width: 16px; height: 16px;"></div>
                      {/if}
                      <span style="font-size: 11px; font-weight: 700;">{displayProfileName(authorProfile, authorDid)}</span>
                    </div>
                    {#if isLatest}
                      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; background: var(--accent); color: #fff; padding: 0.15rem 0.5rem; border-radius: 2px; margin-left: auto;">LATEST</div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}

      {#if sporeGroups.noSubject.length > 0}
        <div class="card" style="padding: 1.5rem;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 1rem;">
            No Subject · {sporeGroups.noSubject.length} record{sporeGroups.noSubject.length === 1 ? '' : 's'}
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            {#each sporeGroups.noSubject as record}
              {@const createdAt = getRecordCreatedAt(record)}
              {@const authorDid = extractAuthorDid(record.uri)}
              {@const authorProfile = authorProfiles.get(authorDid) ?? null}
              <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--border-radius);">
                <code class="mono" style="color: var(--accent); font-weight: 700; border: none; background: transparent; padding: 0; font-size: 12px;">{rkey(record.uri)}</code>
                {#if createdAt}
                  <span style="color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase;">{formatDate(createdAt)}</span>
                {/if}
                <div style="display: flex; align-items: center; gap: 0.3rem;">
                  <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--muted);">by</span>
                  {#if authorProfile?.avatar}
                    <img src={authorProfile.avatar} alt="" style="width: 16px; height: 16px; border-radius: 2px; border: 1px solid var(--border-dark);" />
                  {:else}
                    <div class="avatar-placeholder" style="width: 16px; height: 16px;"></div>
                  {/if}
                  <span style="font-size: 11px; font-weight: 700;">{displayProfileName(authorProfile, authorDid)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
{/if}
