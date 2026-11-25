import { PrismaClient, ItemRarity } from '@prisma/client';
import { ECONOMY } from '@castino/shared';

const prisma = new PrismaClient();

const CSGO_API_CRATES_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';

interface ApiSkin {
  id: string;
  name: string;
  rarity?: {
    id: string;
    name: string;
    color: string;
  };
  image: string;
}

interface ApiCrate {
  id: string;
  name: string;
  description?: string | null;
  image: string;
  contains?: ApiSkin[];
  contains_rare?: ApiSkin[];
}

interface TargetCaseSpec {
  apiName: string;
  displayName?: string;
  slug: string;
  price: number; // en centimes (100 = 1.00 $)
  category: 'free-budget' | 'classic' | 'premium' | 'high-roller' | 'whale';
  sortOrder: number;
  description: string;
}

const TARGET_CASES: TargetCaseSpec[] = [
  // === GRATUIT & BUDGET ($0 à $5) ===
  {
    apiName: 'Prisma Case',
    displayName: 'Free Prisma Case',
    slug: 'free-prisma-case',
    price: 0, // $0.00 GRATUIT !
    category: 'free-budget',
    sortOrder: 1,
    description: 'Caisse CS2 100% GRATUITE toutes les 60 secondes pour démarrer votre inventaire !',
  },
  {
    apiName: 'Recoil Case',
    slug: 'recoil-case',
    price: 50, // $0.50
    category: 'free-budget',
    sortOrder: 2,
    description: 'USP-S Printstream, AWP Chromatic Aberration & Gants Broken Fang.',
  },
  {
    apiName: 'Snakebite Case',
    slug: 'snakebite-case',
    price: 100, // $1.00
    category: 'free-budget',
    sortOrder: 3,
    description: 'USP-S The Traitor, M4A4 In Living Color & Gants Broken Fang ★.',
  },
  {
    apiName: 'Clutch Case',
    slug: 'clutch-case',
    price: 150, // $1.50
    category: 'free-budget',
    sortOrder: 4,
    description: 'M4A4 Neo-Noir, MP7 Bloodsport & Gants Vice / Amphibious ★.',
  },
  {
    apiName: 'Fracture Case',
    slug: 'fracture-case',
    price: 250, // $2.50
    category: 'free-budget',
    sortOrder: 5,
    description: 'Desert Eagle Printstream, AK-47 Legion of Anubis & Couteaux Shattered Web ★.',
  },
  {
    apiName: 'Prisma 2 Case',
    slug: 'prisma-2-case',
    price: 400, // $4.00
    category: 'free-budget',
    sortOrder: 6,
    description: 'M4A1-S Player Two, Glock-18 Bullet Queen & Couteaux Doppler ★.',
  },

  // === CLASSIQUES ($6 à $50) ===
  {
    apiName: 'Chroma 3 Case',
    slug: 'chroma-3-case',
    price: 600, // $6.00
    category: 'classic',
    sortOrder: 7,
    description: 'M4A1-S Chantico’s Fire, PP-Bizon Judgement of Anubis & Marble Fade ★.',
  },
  {
    apiName: 'Dreams & Nightmares Case',
    slug: 'dreams-and-nightmares-case',
    price: 1000, // $10.00
    category: 'classic',
    sortOrder: 8,
    description: 'AK-47 Nightwish, MP9 Starlight Protector & Butterfly Gamma Doppler Emerald ★.',
  },
  {
    apiName: 'Revolution Case',
    slug: 'revolution-case',
    price: 1500, // $15.00
    category: 'classic',
    sortOrder: 9,
    description: 'M4A4 Temukau, AK-47 Head Shot, AWP Duality & Gants Clutch ★.',
  },
  {
    apiName: 'Kilowatt Case',
    slug: 'kilowatt-case',
    price: 2500, // $25.00
    category: 'classic',
    sortOrder: 10,
    description: 'AK-47 Inheritance, AWP Chrome Cannon & Couteaux Kukri ★.',
  },
  {
    apiName: 'Gallery Case',
    slug: 'gallery-case',
    price: 3500, // $35.00
    category: 'classic',
    sortOrder: 11,
    description: 'M4A1-S Vaporwave, Glock-18 Gold Toof & Couteaux Kukri ★.',
  },
  {
    apiName: 'Danger Zone Case',
    slug: 'danger-zone-case',
    price: 5000, // $50.00
    category: 'classic',
    sortOrder: 12,
    description: 'AK-47 Asiimov, AWP Neo-Noir & Couteaux Talon / Ursus ★.',
  },

  // === PREMIUM ($75 à $1 000) ===
  {
    apiName: 'Horizon Case',
    slug: 'horizon-case',
    price: 7500, // $75.00
    category: 'premium',
    sortOrder: 13,
    description: 'AK-47 Neon Rider, Desert Eagle Code Red & Couteaux Talon / Stiletto ★.',
  },
  {
    apiName: 'Gamma 2 Case',
    slug: 'gamma-2-case',
    price: 12500, // $125.00
    category: 'premium',
    sortOrder: 14,
    description: 'AK-47 Neon Revolution, FAMAS Roll Cage & Karambit Gamma Doppler ★.',
  },
  {
    apiName: 'Spectrum 2 Case',
    slug: 'spectrum-2-case',
    price: 20000, // $200.00
    category: 'premium',
    sortOrder: 15,
    description: 'AK-47 The Empress, P250 See Ya Later & Butterfly Doppler ★.',
  },
  {
    apiName: 'Glove Case',
    slug: 'glove-case',
    price: 35000, // $350.00
    category: 'premium',
    sortOrder: 16,
    description: 'M4A4 Buzz Kill, SSG 08 Dragonfire & Gants Pandora’s Box / Hedge Maze ★.',
  },
  {
    apiName: 'Operation Riptide Case',
    slug: 'operation-riptide-case',
    price: 50000, // $500.00
    category: 'premium',
    sortOrder: 17,
    description: 'Desert Eagle Ocean Drive, AK-47 Leet Museo & Butterfly Lore ★.',
  },
  {
    apiName: 'Operation Broken Fang Case',
    slug: 'operation-broken-fang-case',
    price: 100000, // $1 000.00
    category: 'premium',
    sortOrder: 18,
    description: 'M4A1-S Printstream, Glock-18 Neo-Noir & Gants Snow Leopard / Slingshot ★.',
  },

  // === HIGH ROLLER ($2 500 à $25 000) ===
  {
    apiName: 'Operation Hydra Case',
    slug: 'operation-hydra-case',
    price: 250000, // $2 500.00
    category: 'high-roller',
    sortOrder: 19,
    description: 'AWP Oni Taiji, Five-SeveN Hyper Beast & Gants Pandora’s Box ★.',
  },
  {
    apiName: 'Operation Wildfire Case',
    slug: 'operation-wildfire-case',
    price: 500000, // $5 000.00
    category: 'high-roller',
    sortOrder: 20,
    description: 'AK-47 Fuel Injector, M4A4 The Battlestar & Bowie Fade ★.',
  },
  {
    apiName: 'CS:GO Weapon Case 2',
    slug: 'csgo-weapon-case-2',
    price: 1000000, // $10 000.00
    category: 'high-roller',
    sortOrder: 21,
    description: 'SSG 08 Blood in the Water, USP-S Serum & Karambit Crimson Web ★.',
  },
  {
    apiName: 'Operation Bravo Case',
    slug: 'operation-bravo-case',
    price: 2500000, // $25 000.00
    category: 'high-roller',
    sortOrder: 22,
    description: 'AK-47 Fire Serpent, Desert Eagle Golden Koi & Karambit Fade ★.',
  },

  // === WHALE VIP ($50 000 à $100 000) ===
  {
    apiName: 'eSports 2013 Case',
    slug: 'esports-2013-case',
    price: 5000000, // $50 000.00
    category: 'whale',
    sortOrder: 23,
    description: 'Relique 2013 : AWP BOOM, AK-47 Red Laminate & Couteaux Originaux ★.',
  },
  {
    apiName: 'CS:GO Weapon Case',
    slug: 'csgo-weapon-case',
    price: 10000000, // $100 000.00
    category: 'whale',
    sortOrder: 24,
    description: 'La caisse légendaire à $100 000 : AWP Lightning Strike, AK-47 Case Hardened & Couteaux ★ à $1M+.',
  },
];

function mapCsRarity(rarityName?: string): ItemRarity {
  const n = (rarityName || '').toLowerCase();
  if (n.includes('covert') || n.includes('extraordinary')) return 'EPIC';
  if (n.includes('classified')) return 'RARE';
  if (n.includes('restricted')) return 'UNCOMMON';
  return 'COMMON';
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/★/g, 'star')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitWeaponAndSkin(fullName: string): { weapon: string; skin: string } {
  const parts = fullName.split('|');
  if (parts.length >= 2) {
    return {
      weapon: parts[0].trim(),
      skin: parts.slice(1).join('|').trim(),
    };
  }
  return { weapon: 'Special ★', skin: fullName.trim() };
}

function computeSkinValue(casePrice: number, rarity: ItemRarity, indexInTier: number): number {
  const jitter = 1 + (indexInTier % 5) * 0.12;
  // Base de valorisation pour la caisse gratuite ($0) : récompenses entre $0.15 et $45
  const effectiveBase = casePrice === 0 ? 120 : casePrice;
  const isWhale = casePrice >= 2_500_000;

  let raw = 0;
  switch (rarity) {
    case 'COMMON':
      raw = Math.max(15, Math.round(effectiveBase * 0.25 * jitter));
      break;
    case 'UNCOMMON':
      raw = Math.round(effectiveBase * 0.92 * jitter);
      break;
    case 'RARE':
      raw = Math.round(effectiveBase * (isWhale ? 2.4 : 3.1) * jitter);
      break;
    case 'EPIC':
      raw = Math.round(effectiveBase * (isWhale ? 6.5 : 12.5) * jitter);
      break;
    case 'LEGENDARY':
      raw = Math.round(effectiveBase * (isWhale ? 15 : 42) * jitter);
      break;
  }

  // Plafond sûr pour rester largement sous Int32 max ($21.4M)
  return Math.min(raw, 250_000_000);
}

async function main() {
  console.log('🌐 Synchronisation des 24 vraies caisses CS2 ($0 à $100 000) depuis CSGO-API...');
  const res = await fetch(CSGO_API_CRATES_URL);
  if (!res.ok) {
    throw new Error(`Impossible de joindre CSGO-API (HTTP ${res.status})`);
  }
  const allCrates = (await res.json()) as ApiCrate[];

  await prisma.case.updateMany({
    where: { slug: { notIn: TARGET_CASES.map((c) => c.slug) } },
    data: { isActive: false },
  });

  let totalItems = 0;

  for (const spec of TARGET_CASES) {
    const apiCrate = allCrates.find((c) => c.name === spec.apiName);
    if (!apiCrate || !apiCrate.contains || apiCrate.contains.length === 0) {
      console.warn(`⚠️ Caisse introuvable dans CSGO-API : ${spec.apiName}`);
      continue;
    }

    const savedCase = await prisma.case.upsert({
      where: { slug: spec.slug },
      update: {
        name: spec.displayName || apiCrate.name,
        description: spec.description,
        imageUrl: apiCrate.image,
        price: spec.price,
        category: spec.category,
        sortOrder: spec.sortOrder,
        isActive: true,
      },
      create: {
        slug: spec.slug,
        name: spec.displayName || apiCrate.name,
        description: spec.description,
        imageUrl: apiCrate.image,
        price: spec.price,
        category: spec.category,
        sortOrder: spec.sortOrder,
        isActive: true,
      },
    });

    const normalSkins = apiCrate.contains.filter((s) => Boolean(s.image));
    const rarePool = (apiCrate.contains_rare || []).filter((s) => Boolean(s.image));
    const preferredKeywords = [
      'doppler',
      'fade',
      'lore',
      'vice',
      'pandora',
      'crimson',
      'slaughter',
      'marble',
      'tiger',
      'kukri',
    ];
    const sortedRare = [...rarePool].sort((a, b) => {
      const scoreA = preferredKeywords.some((k) => a.name.toLowerCase().includes(k)) ? 1 : 0;
      const scoreB = preferredKeywords.some((k) => b.name.toLowerCase().includes(k)) ? 1 : 0;
      return scoreB - scoreA;
    });
    const pickedGold = sortedRare.slice(0, 4);

    const grouped: Record<ItemRarity, { skin: ApiSkin; rarity: ItemRarity }[]> = {
      COMMON: [],
      UNCOMMON: [],
      RARE: [],
      EPIC: [],
      LEGENDARY: [],
    };

    for (const skin of normalSkins) {
      grouped[mapCsRarity(skin.rarity?.name)].push({ skin, rarity: mapCsRarity(skin.rarity?.name) });
    }
    for (const gold of pickedGold) {
      grouped.LEGENDARY.push({ skin: gold, rarity: 'LEGENDARY' });
    }

    const tierBudgets: Record<ItemRarity, number> = {
      COMMON: 74500,
      UNCOMMON: 16500,
      RARE: 5600,
      EPIC: 2400,
      LEGENDARY: 1000,
    };

    const activeTiers = (Object.keys(grouped) as ItemRarity[]).filter((t) => grouped[t].length > 0);
    let unusedBudget = 0;
    for (const t of Object.keys(grouped) as ItemRarity[]) {
      if (grouped[t].length === 0) {
        unusedBudget += tierBudgets[t];
        tierBudgets[t] = 0;
      }
    }
    if (unusedBudget > 0 && activeTiers.length > 0) {
      tierBudgets[activeTiers[0]] += unusedBudget;
    }

    await prisma.caseItem.deleteMany({ where: { caseId: savedCase.id } });

    const caseEntries: { itemId: string; weight: number }[] = [];
    const seenItemIds = new Set<string>();

    for (const tier of activeTiers) {
      const list = grouped[tier];
      const budget = tierBudgets[tier];
      const baseWeight = Math.floor(budget / list.length);
      let remainder = budget - baseWeight * list.length;

      for (let i = 0; i < list.length; i++) {
        const { skin, rarity } = list[i];
        const { weapon, skin: skinName } = splitWeaponAndSkin(skin.name);
        // Slug scopé par caisse afin que chaque niveau de prix ait sa propre valeur cohérente
        const itemSlug = `${spec.slug}-${slugify(skin.name)}-${skin.id.slice(-4)}`;
        const value = computeSkinValue(spec.price, rarity, i);

        const savedItem = await prisma.item.upsert({
          where: { slug: itemSlug },
          update: {
            name: skinName,
            weaponOrCategory: weapon,
            imageUrl: skin.image,
            rarity,
            value,
          },
          create: {
            slug: itemSlug,
            name: skinName,
            weaponOrCategory: weapon,
            imageUrl: skin.image,
            rarity,
            value,
          },
        });
        totalItems++;

        const w = baseWeight + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;

        if (!seenItemIds.has(savedItem.id)) {
          seenItemIds.add(savedItem.id);
          caseEntries.push({ itemId: savedItem.id, weight: w });
        }
      }
    }

    const sumW = caseEntries.reduce((acc, e) => acc + e.weight, 0);
    if (caseEntries.length > 0 && sumW !== ECONOMY.CASE_TOTAL_TICKETS) {
      caseEntries[0].weight += ECONOMY.CASE_TOTAL_TICKETS - sumW;
    }

    let cursor = 0;
    for (const entry of caseEntries) {
      const ticketStart = cursor;
      const ticketEnd = cursor + entry.weight - 1;
      cursor += entry.weight;

      await prisma.caseItem.create({
        data: {
          caseId: savedCase.id,
          itemId: entry.itemId,
          weight: entry.weight,
          ticketStart,
          ticketEnd,
        },
      });
    }
  }

  console.log(`✅ ${TARGET_CASES.length} caisses CS2 ($0 à $100 000) & ${totalItems} skins synchronisés !`);
}

main()
  .catch((err) => {
    console.error('Seed CS2 error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
