<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { COLLECTIONS, GROUPS } from '$lib/collections.js';
  import { listReposByCollection } from '$lib/at-client.js';

  type Stat = {
    nsid: string;
    label: string;
    group: string;
    userCount: number | null;
    loading: boolean;
    error: string | null;
  };

  let stats = $state<Stat[]>(
    COLLECTIONS.map((c) => ({
      nsid: c.nsid,
      label: c.label,
      group: c.group,
      userCount: null,
      loading: true,
      error: null
    }))
  );

  let customNsid = $state('');
  let customStat = $state<Stat | null>(null);
  let customLoading = $state(false);

  onMount(() => {
    // Kick off all queries in parallel, update state as each resolves
    stats.forEach((_, i) => {
      listReposByCollection(stats[i].nsid)
        .then((dids) => {
          stats[i].userCount = dids.length;
          stats[i].loading = false;
        })
        .catch((err: Error) => {
          stats[i].error = err.message;
          stats[i].loading = false;
        });
    });
  });

  async function queryCustom() {
    const nsid = customNsid.trim();
    if (!nsid || customLoading) return;

    customLoading = true;
    customStat = { nsid, label: nsid, group: 'custom', userCount: null, loading: true, error: null };

    try {
      const dids = await listReposByCollection(nsid);
      customStat.userCount = dids.length;
      customStat.loading = false;
    } catch (err) {
      customStat.error = err instanceof Error ? err.message : String(err);
      customStat.loading = false;
    } finally {
      customLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') queryCustom();
  }

  function statsByGroup(groupId: string) {
    return stats.filter((s) => s.group === groupId);
  }
</script>

<div class="section">
  <div class="page-title">Lexicon Stats</div>
  <div class="page-subtitle">Monitoring adoption across spores.garden collections</div>
</div>

{#each GROUPS as group}
  <div class="section">
    <div class="section-title">
      {group.label}
      <span style="font-weight: 500; text-transform: none; letter-spacing: 0; margin-left: 0.5rem; color: var(--muted); font-size: 14px;">
        — {group.description}
      </span>
    </div>
    <div class="grid">
      {#each statsByGroup(group.id) as stat}
        <a class="card" href="{base}/collection/{encodeURIComponent(stat.nsid)}" style="display:block; text-decoration: none; color: inherit;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <div>
              <div style="font-weight: 800; font-size: 1.1rem; text-transform: uppercase; letter-spacing: -0.02em;">{stat.label}</div>
              <div class="mono" style="color: var(--muted); margin-top: 0.25rem; font-size: 12px; border: none; background: transparent; padding: 0;">{stat.nsid}</div>
            </div>
            {#if stat.loading}
              <span class="spinner"></span>
            {:else if stat.error}
              <span class="badge badge-muted" title={stat.error}>error</span>
            {/if}
          </div>
          {#if !stat.loading && !stat.error}
            <div class="stat-number">{stat.userCount}</div>
            <div class="stat-label">users</div>
          {:else if stat.error}
            <div class="error">{stat.error}</div>
          {:else}
            <div style="color: var(--muted); font-size: 14px; font-weight: 600;">FETCHING...</div>
          {/if}
        </a>
      {/each}
    </div>
  </div>
{/each}

<div class="section">
  <div class="section-title">Custom NSID Query</div>
  <div class="query-box">
    <label for="custom-nsid">NSID</label>
    <input
      id="custom-nsid"
      type="text"
      bind:value={customNsid}
      onkeydown={handleKeydown}
      placeholder="e.g. app.bsky.feed.post"
      spellcheck="false"
    />
    <button onclick={queryCustom} disabled={customLoading || !customNsid.trim()}>
      {customLoading ? 'QUERYING...' : 'QUERY'}
    </button>
  </div>

  {#if customStat}
    <div style="margin-top: 2rem;">
      {#if customStat.loading}
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="spinner"></span> <span style="color: var(--muted); font-size: 14px; font-weight: 600;">FETCHING {customStat.nsid}...</span>
        </div>
      {:else if customStat.error}
        <div class="error" style="font-weight: 700;">{customStat.error}</div>
      {:else}
        <div class="card" style="display: inline-block; min-width: 300px;">
          <div class="mono" style="color: var(--muted); font-size: 12px; margin-bottom: 1rem; border: none; background: transparent; padding: 0;">{customStat.nsid}</div>
          <div class="stat-number">{customStat.userCount}</div>
          <div class="stat-label">users</div>
          <div style="margin-top: 1.5rem;">
            <a href="{base}/collection/{encodeURIComponent(customStat.nsid)}" style="font-size: 14px; font-weight: 700; text-transform: uppercase;">
              View details →
            </a>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
