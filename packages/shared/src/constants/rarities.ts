export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface RarityMeta {
  key: ItemRarity;
  label: string;
  color: string;
  bgGlow: string;
  border: string;
  order: number;
}

export const RARITIES: Record<ItemRarity, RarityMeta> = {
  COMMON: {
    key: 'COMMON',
    label: 'Mil-Spec',
    color: '#4b69ff',
    bgGlow: 'rgba(75, 105, 255, 0.18)',
    border: '#4b69ff',
    order: 1,
  },
  UNCOMMON: {
    key: 'UNCOMMON',
    label: 'Restreint',
    color: '#8847ff',
    bgGlow: 'rgba(136, 71, 255, 0.20)',
    border: '#8847ff',
    order: 2,
  },
  RARE: {
    key: 'RARE',
    label: 'Classifié',
    color: '#d32ce6',
    bgGlow: 'rgba(211, 44, 230, 0.22)',
    border: '#d32ce6',
    order: 3,
  },
  EPIC: {
    key: 'EPIC',
    label: 'Secret',
    color: '#eb4b4b',
    bgGlow: 'rgba(235, 75, 75, 0.24)',
    border: '#eb4b4b',
    order: 4,
  },
  LEGENDARY: {
    key: 'LEGENDARY',
    label: 'Légendaire ★',
    color: '#eab308',
    bgGlow: 'rgba(234, 179, 8, 0.28)',
    border: '#eab308',
    order: 5,
  },
};
