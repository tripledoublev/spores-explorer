<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { listAllRecords, getProfiles, type AtRecord, type BskyProfile } from '$lib/at-client.js';
  import GardenStyle from '$lib/components/GardenStyle.svelte';

  let did = $derived(page.params.did ?? '');
  let nsid = $derived(page.params.nsid ?? '');

  let records = $state<AtRecord[]>([]);
  let profile = $state<BskyProfile | null>(null);
  let subjectProfiles = $state<Map<string, BskyProfile | null>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let viewMode = $state<'records' | 'lineage'>('records');

  // Track which records have expanded JSON
  let expanded = $state<Set<string>>(new Set());

  $effect(() => {
    void loadRecords(did, nsid);
  });

  async function loadRecords(userDid: string, collection: string) {
    records = [];
    profile = null;
    subjectProfiles = new Map();
    loading = true;
    error = null;
    expanded = new Set();

    // Fetch records and profile in parallel
    const [recs, profiles] = await Promise.all([
      listAllRecords(userDid, collection).catch((err: Error) => {
        error = err.message;
        return [] as AtRecord[];
      }),
      getProfiles([userDid]).catch(() => new Map<string, BskyProfile | null>())
    ]);

    records = recs;
    profile = profiles.get(userDid) ?? null;

    // Identify subject DIDs to fetch profiles for
    const subjectDids = new Set<string>();
    for (const rec of recs) {
      const subject = (rec.value as any).subject;
      if (typeof subject === 'string') {
        subjectDids.add(subject);
      } else if (subject && typeof subject.did === 'string') {
        subjectDids.add(subject.did);
      }
    }

    if (subjectDids.size > 0) {
      try {
        subjectProfiles = await getProfiles([...subjectDids]);
      } catch (err) {
        console.error('Failed to fetch subject profiles:', err);
      }
    }

    loading = false;
  }

  function getSubjectInfo(record: AtRecord): BskyProfile | string | null {
    const subject = (record.value as any).subject;
    const subjectDid = typeof subject === 'string' ? subject : (subject?.did as string | undefined);
    if (!subjectDid) return null;
    return subjectProfiles.get(subjectDid) ?? subjectDid;
  }

  function getSubjectDid(record: AtRecord): string | null {
    const subject = (record.value as any).subject;
    return typeof subject === 'string' ? subject : (subject?.did as string | undefined) ?? null;
  }

  function toggleExpanded(uri: string) {
    const next = new Set(expanded);
    if (next.has(uri)) {
      next.delete(uri);
    } else {
      next.add(uri);
    }
    expanded = next;
  }

  function getCreatedAt(record: AtRecord): string | null {
    const val = record.value;
    if (typeof val.createdAt === 'string') return val.createdAt;
    if (typeof val.$createdAt === 'string') return val.$createdAt;
    return null;
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function rkey(uri: string): string {
    return uri.split('/').at(-1) ?? uri;
  }

  function displayName(): string {
    if (profile?.displayName) return profile.displayName;
    if (profile?.handle) return '@' + profile.handle;
    return did;
  }

  // Lineage grouping: groups records by subject DID, sorted chronologically within groups
  // and groups sorted by most recently active subject first
  let lineageGroups = $derived.by(() => {
    const groups = new Map<string, AtRecord[]>();
    const noSubject: AtRecord[] = [];

    for (const rec of records) {
      const subDid = getSubjectDid(rec);
      if (!subDid) {
        noSubject.push(rec);
        continue;
      }
      if (!groups.has(subDid)) groups.set(subDid, []);
      groups.get(subDid)!.push(rec);
    }

    // Sort records within each group by createdAt ascending (oldest first, latest last)
    for (const recs of groups.values()) {
      recs.sort((a, b) => {
        const ta = getCreatedAt(a) ?? '';
        const tb = getCreatedAt(b) ?? '';
        return ta.localeCompare(tb);
      });
    }

    // Sort groups by latest record's createdAt descending (most recently active first)
    const sorted = [...groups.entries()].sort((a, b) => {
      const ta = getCreatedAt(a[1].at(-1)!) ?? '';
      const tb = getCreatedAt(b[1].at(-1)!) ?? '';
      return tb.localeCompare(ta);
    });

    // Sort noSubject records chronologically ascending
    noSubject.sort((a, b) => {
      const ta = getCreatedAt(a) ?? '';
      const tb = getCreatedAt(b) ?? '';
      return ta.localeCompare(tb);
    });

    return { groups: sorted, noSubject };
  });
</script>

<a class="back" href="{base}/collection/{encodeURIComponent(nsid)}">← BACK TO COLLECTION</a>

<div class="page-title">{displayName()}</div>
<div class="page-subtitle" style="text-transform: none;">{did}</div>

{#if profile}
  <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 3rem; background: var(--surface); padding: 1.5rem; border: var(--border-width) solid var(--border-dark); border-radius: var(--border-radius); box-shadow: var(--shadow-neobrutal); width: fit-content;">
    {#if profile.avatar}
      <img src={profile.avatar} alt="" style="width: 64px; height: 64px; border-radius: 4px; border: var(--border-width) solid var(--border-dark); object-fit: cover;" />
    {:else}
      <div class="avatar-placeholder" style="width: 64px; height: 64px; border-width: var(--border-width);"></div>
    {/if}
    <div>
      {#if profile.displayName}
        <div style="font-weight: 800; font-size: 1.5rem; letter-spacing: -0.02em;">{profile.displayName}</div>
      {/if}
      <div style="color: var(--muted); font-size: 1rem; font-weight: 600;">@{profile.handle}</div>
    </div>
  </div>
{/if}

<div class="section-title">
  {nsid}
</div>

{#if loading}
  <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--muted); font-weight: 700;">
    <span class="spinner"></span>
    LOADING RECORDS...
  </div>
{:else if error}
  <div class="error" style="font-weight: 700;">ERROR: {error}</div>
{:else if records.length === 0}
  <div style="color: var(--muted); font-weight: 700;">NO RECORDS FOUND.</div>
{:else}
  <div style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
    <div style="color: var(--muted); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
      {records.length} record{records.length === 1 ? '' : 's'}
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button
        onclick={() => viewMode = 'records'}
        style="font-size: 12px; padding: 0.4rem 1rem;{viewMode === 'records' ? ' background: var(--fg); color: var(--bg); border-color: var(--fg);' : ''}"
      >RECORDS</button>
      <button
        onclick={() => viewMode = 'lineage'}
        style="font-size: 12px; padding: 0.4rem 1rem;{viewMode === 'lineage' ? ' background: var(--fg); color: var(--bg); border-color: var(--fg);' : ''}"
      >LINEAGE</button>
    </div>
  </div>

  {#if viewMode === 'records'}
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      {#each records as record}
        {@const createdAt = getCreatedAt(record)}
        {@const subjectInfo = getSubjectInfo(record)}
        <div class="card" style="padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 250px;">
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                <code class="mono" style="color: var(--accent); font-weight: 700; border: none; background: transparent; padding: 0;">{rkey(record.uri)}</code>
                {#if createdAt}
                  <div style="color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase;">
                    {formatDate(createdAt)}
                  </div>
                {/if}
              </div>

              {#if subjectInfo}
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                  <div style="font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Subject</div>
                  <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 4px;">
                      <GardenStyle
                        did={typeof subjectInfo === 'object' ? subjectInfo.did : subjectInfo}
                        size={48}
                        isSpore={nsid.includes('specialSpore')}
                      />
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      {#if typeof subjectInfo === 'object' && subjectInfo !== null}
                        {#if subjectInfo.avatar}
                          <img src={subjectInfo.avatar} alt="" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-dark); object-fit: cover;" />
                        {:else}
                          <div class="avatar-placeholder" style="width: 24px; height: 24px;"></div>
                        {/if}
                        <div style="font-weight: 700; font-size: 13px;">
                          {subjectInfo.displayName || '@' + subjectInfo.handle}
                        </div>
                      {:else}
                        <code class="mono" style="font-size: 11px; color: var(--muted); background: transparent; border: none; padding: 0;">{subjectInfo}</code>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
            <button
              onclick={() => toggleExpanded(record.uri)}
              style="font-size: 12px; padding: 0.4rem 1rem;"
            >
              {expanded.has(record.uri) ? 'COLLAPSE' : 'EXPAND JSON'}
            </button>
          </div>

          {#if expanded.has(record.uri)}
            <div class="json-block" style="margin-top: 1.5rem; border: 1px solid var(--border);">
              {JSON.stringify(record.value, null, 2)}
            </div>
          {/if}
        </div>
      {/each}
    </div>

  {:else}
    <!-- LINEAGE VIEW -->
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      {#each lineageGroups.groups as [subjectDid, groupRecords]}
        {@const subjectInfo = subjectProfiles.get(subjectDid) ?? subjectDid}
        <div class="card" style="padding: 1.5rem;">
          <!-- Group header -->
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: var(--border-width) solid var(--border-dark);">
            <div style="width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 4px;">
              <GardenStyle did={subjectDid} size={48} isSpore={nsid.includes('specialSpore')} />
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;">
              {#if typeof subjectInfo === 'object' && subjectInfo !== null}
                {#if subjectInfo.avatar}
                  <img src={subjectInfo.avatar} alt="" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-dark); object-fit: cover; flex-shrink: 0;" />
                {:else}
                  <div class="avatar-placeholder" style="width: 24px; height: 24px; flex-shrink: 0;"></div>
                {/if}
                <div style="font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {subjectInfo.displayName || '@' + subjectInfo.handle}
                </div>
              {:else}
                <code class="mono" style="font-size: 11px; color: var(--muted); background: transparent; border: none; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{subjectDid}</code>
              {/if}
            </div>
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface); border: var(--border-width) solid var(--border-dark); padding: 0.2rem 0.6rem; border-radius: var(--border-radius); flex-shrink: 0; box-shadow: var(--shadow-neobrutal);">
              {groupRecords.length} record{groupRecords.length === 1 ? '' : 's'}
            </div>
          </div>

          <!-- Timeline -->
          <div style="position: relative; padding-left: 24px;">
            <!-- Vertical connector line -->
            <div style="position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--border-dark);"></div>

            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              {#each groupRecords as record, i}
                {@const createdAt = getCreatedAt(record)}
                {@const isLatest = i === groupRecords.length - 1}
                <div style="position: relative;">
                  <!-- Timeline dot -->
                  <div style="position: absolute; left: -21px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; border-radius: 50%; background: {isLatest ? 'var(--accent)' : 'var(--border-dark)'}; border: 2px solid var(--bg);"></div>

                  <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.75rem; border-radius: var(--border-radius); background: {isLatest ? 'var(--surface)' : 'transparent'}; border: {isLatest ? 'var(--border-width) solid var(--border-dark)' : '1px solid transparent'}; {isLatest ? 'box-shadow: var(--shadow-neobrutal);' : ''}">
                    <code class="mono" style="color: var(--accent); font-weight: 700; border: none; background: transparent; padding: 0; font-size: 12px;">{rkey(record.uri)}</code>
                    {#if createdAt}
                      <div style="color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase;">{formatDate(createdAt)}</div>
                    {/if}
                    {#if isLatest}
                      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; background: var(--accent); color: #fff; padding: 0.15rem 0.5rem; border-radius: 2px;">LATEST</div>
                    {/if}
                    <button
                      onclick={() => toggleExpanded(record.uri)}
                      style="font-size: 11px; padding: 0.2rem 0.6rem; margin-left: auto;"
                    >{expanded.has(record.uri) ? 'COLLAPSE' : 'JSON'}</button>
                  </div>

                  {#if expanded.has(record.uri)}
                    <div class="json-block" style="margin-top: 0.4rem; border: 1px solid var(--border);">
                      {JSON.stringify(record.value, null, 2)}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}

      <!-- Records with no subject field, shown at the bottom -->
      {#if lineageGroups.noSubject.length > 0}
        <div class="card" style="padding: 1.5rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: var(--border-width) solid var(--border-dark);">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted);">No Subject</div>
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface); border: var(--border-width) solid var(--border-dark); padding: 0.2rem 0.6rem; border-radius: var(--border-radius); flex-shrink: 0; box-shadow: var(--shadow-neobrutal);">
              {lineageGroups.noSubject.length} record{lineageGroups.noSubject.length === 1 ? '' : 's'}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            {#each lineageGroups.noSubject as record}
              {@const createdAt = getCreatedAt(record)}
              <div>
                <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--border-radius);">
                  <code class="mono" style="color: var(--accent); font-weight: 700; border: none; background: transparent; padding: 0; font-size: 12px;">{rkey(record.uri)}</code>
                  {#if createdAt}
                    <div style="color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase;">{formatDate(createdAt)}</div>
                  {/if}
                  <button
                    onclick={() => toggleExpanded(record.uri)}
                    style="font-size: 11px; padding: 0.2rem 0.6rem; margin-left: auto;"
                  >{expanded.has(record.uri) ? 'COLLAPSE' : 'JSON'}</button>
                </div>
                {#if expanded.has(record.uri)}
                  <div class="json-block" style="margin-top: 0.4rem; border: 1px solid var(--border);">
                    {JSON.stringify(record.value, null, 2)}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
{/if}
