export type CollectionInfo = {
  nsid: string;
  label: string;
  group: 'coop.hypha.spores' | 'garden.spores';
};

const CURRENT_COLLECTIONS: CollectionInfo[] = [
  { nsid: 'coop.hypha.spores.site.config', label: 'Site Config', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.site.layout', label: 'Site Layout', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.site.section', label: 'Site Section', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.site.profile', label: 'Site Profile', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.content.text', label: 'Content Text', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.content.image', label: 'Content Image', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.social.flower', label: 'Social Flower', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.social.takenFlower', label: 'Taken Flower', group: 'coop.hypha.spores' },
  { nsid: 'coop.hypha.spores.item.specialSpore', label: 'Special Spore', group: 'coop.hypha.spores' }
];

const LEGACY_COLLECTIONS: CollectionInfo[] = [
  { nsid: 'garden.spores.site.config', label: 'Site Config', group: 'garden.spores' },
  { nsid: 'garden.spores.site.layout', label: 'Site Layout', group: 'garden.spores' },
  { nsid: 'garden.spores.site.section', label: 'Site Section', group: 'garden.spores' },
  { nsid: 'garden.spores.site.profile', label: 'Site Profile', group: 'garden.spores' },
  { nsid: 'garden.spores.content.text', label: 'Content Text', group: 'garden.spores' },
  { nsid: 'garden.spores.content.image', label: 'Content Image', group: 'garden.spores' },
  { nsid: 'garden.spores.social.flower', label: 'Social Flower', group: 'garden.spores' },
  { nsid: 'garden.spores.social.takenFlower', label: 'Taken Flower', group: 'garden.spores' },
  { nsid: 'garden.spores.item.specialSpore', label: 'Special Spore', group: 'garden.spores' }
];

export const COLLECTIONS: CollectionInfo[] = [...CURRENT_COLLECTIONS, ...LEGACY_COLLECTIONS];

export const GROUPS: { id: CollectionInfo['group']; label: string; description: string }[] = [
  {
    id: 'coop.hypha.spores',
    label: 'coop.hypha.spores.*',
    description: 'Current lexicon prefix'
  },
  {
    id: 'garden.spores',
    label: 'garden.spores.*',
    description: 'Legacy lexicon prefix'
  }
];
