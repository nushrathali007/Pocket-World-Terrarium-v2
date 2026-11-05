import { CropType } from '../types/world';

export type PlotLifecycleState =
  | 'prepared'
  | 'sown'
  | 'seedling'
  | 'growing'
  | 'ripe'
  | 'harvested';

export type WeatherPhase =
  | 'clear'
  | 'gathering'
  | 'rain'
  | 'clearing'
  | 'snow';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export type ProgressionTierId =
  | 'first_sprouts'
  | 'kitchen_garden'
  | 'village_farm'
  | 'flourishing_terrarium';

export interface CropBalanceConfig {
  id: CropType;
  label: string;
  shortLabel: string;
  /** Growth duration in seconds under ideal moisture (1.0x modifier) */
  growthTimeSec: number;
  growthDurationSec: number;
  seedCost: number;
  seedCoinCost: number;
  seedCostCoins: number;
  baseYield: number;
  compostBonusYield: number;
  pollinationBonusYield: number;
  sellPrice: number;
  sellPriceCoins: number;
  harvestGardenPoints: number;
  gardenPointsOnHarvest: number;
  unlockTier: ProgressionTierId;
}

/** Shared readiness threshold used across visuals, single harvest, Gather All, counts, and UI */
export const RIPE_GROWTH_THRESHOLD = 0.995;

/** Full day cycle duration in seconds (~12 minutes) */
export const DAY_DURATION_SECONDS = 720;

/** Season duration in seconds */
export const SEASON_DURATION_SEC = 240;

export const SEASONS_ORDER: SeasonId[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
];

export const WEATHER_PHASE_DURATIONS: Record<WeatherPhase, number> = {
  clear: 85,
  gathering: 24,
  rain: 48,
  clearing: 22,
  snow: 52,
};

export const DAYS_PER_SEASON = 2;

export const MAX_WATER_CAPACITY = 20;

export const CROP_CONFIGS: Record<CropType, CropBalanceConfig> = {
  berry: {
    id: 'berry',
    label: 'Sweet Berries',
    shortLabel: 'Berries',
    growthTimeSec: 240, // 4 minutes
    growthDurationSec: 240,
    seedCost: 3,
    seedCoinCost: 3,
    seedCostCoins: 3,
    baseYield: 2,
    compostBonusYield: 1,
    pollinationBonusYield: 1,
    sellPrice: 4,
    sellPriceCoins: 4,
    harvestGardenPoints: 4,
    gardenPointsOnHarvest: 4,
    unlockTier: 'first_sprouts',
  },
  wheat: {
    id: 'wheat',
    label: 'Golden Wheat',
    shortLabel: 'Wheat',
    growthTimeSec: 480, // 8 minutes
    growthDurationSec: 480,
    seedCost: 5,
    seedCoinCost: 5,
    seedCostCoins: 5,
    baseYield: 2,
    compostBonusYield: 1,
    pollinationBonusYield: 1,
    sellPrice: 6,
    sellPriceCoins: 6,
    harvestGardenPoints: 6,
    gardenPointsOnHarvest: 6,
    unlockTier: 'first_sprouts',
  },
  pumpkin: {
    id: 'pumpkin',
    label: 'Sunlit Pumpkin',
    shortLabel: 'Pumpkin',
    growthTimeSec: 720, // 12 minutes
    growthDurationSec: 720,
    seedCost: 8,
    seedCoinCost: 8,
    seedCostCoins: 8,
    baseYield: 1,
    compostBonusYield: 1,
    pollinationBonusYield: 1,
    sellPrice: 16,
    sellPriceCoins: 16,
    harvestGardenPoints: 10,
    gardenPointsOnHarvest: 10,
    unlockTier: 'kitchen_garden',
  },
};

export const CROP_CONFIG = CROP_CONFIGS;

export const SELL_PRICES = {
  berry: CROP_CONFIGS.berry.sellPrice,
  wheat: CROP_CONFIGS.wheat.sellPrice,
  pumpkin: CROP_CONFIGS.pumpkin.sellPrice,
  honey: 14,
  flour: 16,
};

export const PROCESSED_GOOD_PRICES = {
  flour: SELL_PRICES.flour,
  honey: SELL_PRICES.honey,
};

export const PRODUCTION_CONFIG = {
  flourSellPrice: SELL_PRICES.flour,
  honeySellPrice: SELL_PRICES.honey,
  compostBuyCost: 6,
  windmill: {
    wheatInput: 2,
    flourOutput: 1,
    processingTimeSec: 40,
    processDurationSec: 40,
    maxStoredFlour: 4,
    maxStorage: 4,
    buildCostCoins: 28,
    gardenPoints: 4,
  },
  beehive: {
    baseCycleTimeSec: 55,
    baseDurationSec: 55,
    flowerSpeedBonusPerCluster: 0.15,
    maxFlowerBonus: 0.45,
    maxStoredHoney: 3,
    maxStorage: 3,
    buildCostCoins: 18,
    gardenPoints: 3,
  },
  well: {
    maxWater: 20,
  },
  compostBin: {
    produceInput: 2,
    compostOutput: 2,
  },
  compost: {
    produceInputCount: 2,
    compostOutput: 2,
    coinPurchaseCost: 6,
  },
  dockTrade: {
    wheatRequired: 2,
    berryRequired: 2,
    honeyOrFlourRequired: 1,
    rewardCoins: 42,
    rewardGardenPoints: 20,
    rewardCompost: 2,
  },
};

export const BUILDING_COSTS: Record<string, number> = {
  prepare_bed: 4,
  prepare_plot: 4,
  flower: 5,
  tree: 8,
  beehive: 18,
  sheep: 14,
  house: 22,
  windmill: 28,
  campfire: 10,
  lantern: 8,
  dock: 24,
  lighthouse: 26,
  sailboat: 16,
  villager: 20,
  greenhouse_bell: 14,
  raise: 2,
  lower: 2,
  mountain: 4,
  lake: 4,
};

export interface ProgressionTierDefinition {
  id: ProgressionTierId;
  order: number;
  title: string;
  label: string;
  minGardenPoints: number;
  requiredPoints: number;
  summary: string;
  unlockSummary: string;
  unlocksText: string;
}

export const PROGRESSION_TIERS: ProgressionTierDefinition[] = [
  {
    id: 'first_sprouts',
    order: 0,
    title: 'First Sprouts',
    label: 'First Sprouts',
    minGardenPoints: 0,
    requiredPoints: 0,
    summary: 'Prepare soil beds, sow Berries and Wheat, and water young sprouts.',
    unlockSummary: 'Soil Beds, Berry & Wheat Seeds, Watering Can',
    unlocksText: 'Garden Trowel, Berry & Wheat Seeds, Watering Can, Cottages',
  },
  {
    id: 'kitchen_garden',
    order: 1,
    title: 'Kitchen Garden',
    label: 'Kitchen Garden',
    minGardenPoints: 45,
    requiredPoints: 45,
    summary: 'Enrich beds with compost, plant Pumpkins, and welcome honeybees.',
    unlockSummary: 'Pumpkin Seeds, Rich Compost, Beehives & Sheep',
    unlocksText: 'Pumpkin Seeds, Rich Compost, Wildflowers, Painted Beehives',
  },
  {
    id: 'village_farm',
    order: 2,
    title: 'Village Farm',
    label: 'Village Farm',
    minGardenPoints: 110,
    requiredPoints: 110,
    summary: 'Mill golden grain into flour, trade at the pier, and assign villagers.',
    unlockSummary: 'Grain Windmill, Cottages, Villagers, Pier & Boats',
    unlocksText: 'Grain Windmill, Trade Pier, Sailboats, Sheep & New Villagers',
  },
  {
    id: 'flourishing_terrarium',
    order: 3,
    title: 'Flourishing Terrarium',
    label: 'Flourishing Terrarium',
    minGardenPoints: 220,
    requiredPoints: 220,
    summary: 'Protect winter crops with glass cloches and automate garden tending.',
    unlockSummary: 'Glass Cloche, Auto-Replant & Lighthouse',
    unlocksText: 'Glass Cloche Greenhouse, Auto-Replant, Coastal Lighthouse',
  },
];

export interface MilestoneDefinition {
  id: string;
  title: string;
  desc: string;
  description: string;
  target: number;
  rewardCoins: number;
  coinsReward: number;
  rewardGardenPoints: number;
  gardenPointsReward: number;
}

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    id: 'first_harvest',
    title: 'First Basket',
    desc: 'Harvest 4 ripe crops from your terrarium beds',
    description: 'Harvest 4 ripe crops from your terrarium beds',
    target: 4,
    rewardCoins: 12,
    coinsReward: 12,
    rewardGardenPoints: 15,
    gardenPointsReward: 15,
  },
  {
    id: 'tended_beds',
    title: 'Meadow Gardener',
    desc: 'Maintain 8 garden beds across the planet',
    description: 'Maintain 8 garden beds across the planet',
    target: 8,
    rewardCoins: 16,
    coinsReward: 16,
    rewardGardenPoints: 20,
    gardenPointsReward: 20,
  },
  {
    id: 'sweet_apiary',
    title: 'Pollinator Sanctuary',
    desc: 'Grow 8 wildflower clusters and beehives in the meadow',
    description: 'Grow 8 wildflower clusters and beehives in the meadow',
    target: 8,
    rewardCoins: 20,
    coinsReward: 20,
    rewardGardenPoints: 25,
    gardenPointsReward: 25,
  },
  {
    id: 'golden_miller',
    title: 'Artisan Granary',
    desc: 'Hold 3 sacks of freshly milled Flour in your pantry',
    description: 'Hold 3 sacks of freshly milled Flour in your pantry',
    target: 3,
    rewardCoins: 24,
    coinsReward: 24,
    rewardGardenPoints: 30,
    gardenPointsReward: 30,
  },
  {
    id: 'bountiful_pantry',
    title: 'Bountiful Basket',
    desc: 'Harvest 20 total crops, honey jars, and goods',
    description: 'Harvest 20 total crops, honey jars, and goods',
    target: 20,
    rewardCoins: 30,
    coinsReward: 30,
    rewardGardenPoints: 35,
    gardenPointsReward: 35,
  },
  {
    id: 'peaceful_hamlet',
    title: 'Flourishing Sanctuary',
    desc: 'Reach 14 villagers living and working in harmony',
    description: 'Reach 14 villagers living and working in harmony',
    target: 14,
    rewardCoins: 35,
    coinsReward: 35,
    rewardGardenPoints: 40,
    gardenPointsReward: 40,
  },
];

export function computePlotLifecycleState(
  hasCrop: boolean,
  harvested: boolean,
  growth: number,
): PlotLifecycleState {
  if (harvested) return 'harvested';
  if (!hasCrop) return 'prepared';
  if (growth >= RIPE_GROWTH_THRESHOLD) return 'ripe';
  if (growth >= 0.42) return 'growing';
  if (growth >= 0.12) return 'seedling';
  return 'sown';
}

export function isPlotRipe(
  growthOrHasCrop: number | boolean,
  harvested = false,
  growth?: number,
): boolean {
  if (typeof growthOrHasCrop === 'number') {
    return growthOrHasCrop >= RIPE_GROWTH_THRESHOLD;
  }
  return (
    computePlotLifecycleState(
      growthOrHasCrop,
      harvested,
      growth ?? 0,
    ) === 'ripe'
  );
}

export function getLifecycleLabel(state: PlotLifecycleState): string {
  switch (state) {
    case 'prepared':
      return 'Prepared Bed';
    case 'sown':
      return 'Sown Seed';
    case 'seedling':
      return 'Seedling';
    case 'growing':
      return 'Growing';
    case 'ripe':
      return 'Ripe';
    case 'harvested':
      return 'Harvested Bed';
  }
}

export function getTierForGardenPoints(
  points: number,
): ProgressionTierDefinition {
  let current = PROGRESSION_TIERS[0];
  for (const tier of PROGRESSION_TIERS) {
    if (points >= tier.minGardenPoints) {
      current = tier;
    }
  }
  return current;
}

export function isTierUnlocked(
  currentPoints: number,
  requiredTier: ProgressionTierId,
): boolean {
  const current = getTierForGardenPoints(currentPoints);
  const req = PROGRESSION_TIERS.find((t) => t.id === requiredTier);
  if (!req) return true;
  return current.order >= req.order;
}
