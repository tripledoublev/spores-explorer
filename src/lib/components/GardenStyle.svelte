<script lang="ts">
  import { generateColorsFromDid, generateShadowFromDid } from '$lib/theme.js';
  import { generateFlowerSVGString, generateSporeFlowerSVGString } from '$lib/flower.js';

  let { did, size = 40, isSpore = false } = $props();

  let colors = $derived(generateColorsFromDid(did));
  let shadow = $derived(generateShadowFromDid(did, colors));
  let flowerSvg = $derived(
    isSpore ? generateSporeFlowerSVGString(did, size) : generateFlowerSVGString(did, size)
  );

  let shadowValue = $derived(`${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`);
  let style = $derived(`
    background: ${colors.background};
    border: 2px solid ${colors.border};
    box-shadow: ${shadowValue};
    width: 100%;
    height: 100%;
    padding: 4px;
    border-radius: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  `);
</script>

<div {style} class="garden-style-thumb" title="Generative Garden Style">
  <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
    {@html flowerSvg}
  </div>
</div>

<style>
  .garden-style-thumb:hover {
    transform: scale(1.1);
  }
</style>
