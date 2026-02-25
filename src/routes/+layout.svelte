<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { applyTheme } from '$lib/theme.js';
  import '../app.css';

  let { children } = $props();

  // DID or NSID to generate theme from
  // collection routes use NSID, user routes use DID
  let themeSource = $derived(
    page.params.did || page.params.nsid || 'spores.garden'
  );

  $effect(() => {
    if (browser) {
      applyTheme(themeSource);
    }
  });
</script>

<svelte:head>
  <title>Spores Explorer</title>
  <meta name="description" content="spores.garden lexicon adoption monitor" />
</svelte:head>

<header>
  <div class="container inner">
    <h1><a href="{base}/">Spores Explorer</a></h1>
  </div>
</header>

<main class="container">
  {@render children()}
</main>
