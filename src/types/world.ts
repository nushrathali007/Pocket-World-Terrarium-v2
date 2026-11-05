import {
  PlotLifecycleState,
  ProgressionTierId,
  SeasonId,
  WeatherPhase,
} from '../config/farmConfig';

export type {
  PlotLifecycleState,
  ProgressionTierId,
  SeasonId,
  WeatherPhase,
};

export type CropType = 'wheat' | 'pumpkin' | 'berry';

export type DockCategory = 'plant' | 'tend' | 'harvest' | 'build';

export type ToolId =
  | 'prepare_bed'
  | 'wheat_seed'
  | 'pumpkin_seed'
  | 'berry_seed'
  | 'flower'
  | 'tree'
  | 'water_can'
  | 'compost'
  | 'greenhouse_bell'
  | 'cloud'
  | 'beehive'
  | 'sheep'
  | 'harvest_basket'
  | 'harvest_all'
  | 'remove'
  | 'house'
  | 'windmill'
  | 'lighthouse'
  | 'watchtower'
  | 'campfire'
  | 'lantern'
  | 'dock'
  | 'sailboat'
  | 'duck'
  | 'villager'
  | 'balloon'
  | 'snowcloud'
  | 'rainbow'
  | 'shootingstar'
  | 'raise'
  | 'lower'
  | 'mountain'
  | 'lake';

export type CameraViewId = 'orb' | 'surface' | 'orbit' | 'village';

export type TimeMode = 'auto' | 'day' | 'twilight' | 'night';

export type WeatherMode = 'clear' | 'sunny' | 'rain' | 'snow';

export type WeatherSummary =
  | 'Clear Breeze'
  | 'Gathering Clouds'
  | 'Gentle Rain'
  | 'Fresh After-Rain'
  | 'Soft Snow';

export type VillagerRole =
  | 'Gardener'
  | 'Miller'
  | 'Beekeeper'
  | 'Builder'
  | 'Forager';

export type VillagerAssignment =
  | 'Meadow Plots'
  | 'Windmill & Granary'
  | 'Apiary & Orchards'
  | 'Village Commons'
  | 'Coastal Pier';

export interface HarvestFeedbackBatch {
  wheat: number;
  pumpkin: number;
  berry: number;
  honey: number;
  flour: number;
}

export type SelectedEntityInfo =
  | {
      kind: 'plot';
      id: string;
      cropType: CropType;
      cropLabel: string;
      hasCrop: boolean;
      lifecycleState: PlotLifecycleState;
      stage: string;
      growthPct: number;
      moisturePct: number;
      composted: boolean;
      pollinated: boolean;
      hasCloche: boolean;
      pausedByCold: boolean;
      reservedByVillagerName?: string;
    }
  | {
      kind: 'building';
      id: string;
      buildingType: string;
      title: string;
      subtitle: string;
      harmonyBonus: string;
      actionLabel: string;
      actionDescription: string;
      canPerformAction: boolean;
      secondaryActionLabel?: string;
      canPerformSecondaryAction?: boolean;
      productionProgress?: number; // 0..100
      storedOutput?: number;
      maxStorage?: number;
      removable: boolean;
    }
  | {
      kind: 'villager';
      id: string;
      name: string;
      role: VillagerRole;
      assignment: VillagerAssignment;
      activity: string;
    };

export interface ToolDefinition {
  id: ToolId;
  label: string;
  shortLabel: string;
  category: DockCategory;
  description: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  instantAction?: boolean;
  coinCost?: number;
  requiredTier?: ProgressionTierId;
}

export interface WorldState {
  planetName: string;
  population: number;
  happiness: number;
  dayCount: number;
  activeTool: ToolId | null;
  activeView: CameraViewId;
  timeMode: TimeMode;
  timeOfDay: number;
  weatherSummary: WeatherSummary;
  weatherPhase: WeatherPhase;
  weatherOverride: WeatherPhase | null;
  season: SeasonId;
  tourActive: boolean;
  tourElapsed: number;
  tourPhase: string;
  reducedMotion: boolean;
  selectedEntity: SelectedEntityInfo | null;
  coins: number;
  gardenPoints: number;
  progressionTier: ProgressionTierId;
  progressionTierLabel: string;
  nextTierLabel: string | null;
  nextTierPoints: number | null;
  autoReplantUnlocked: boolean;
  autoReplantEnabled: boolean;
  canClaimFreeSeeds: boolean;
  seedsByCrop: Record<CropType, number>;
  completedMilestones: string[];
  statusMessage: string | null;
  lastSavedAt: number | null;
  resources: {
    seeds: number;
    water: number;
    compost: number;
    harvestTotal: number;
  };
  inventory: {
    wheat: number;
    pumpkin: number;
    berry: number;
    honey: number;
    flour: number;
  };
  stats: {
    totalPlanted: number;
    totalHarvested: number;
    totalTended: number;
  };
  objectCounts: {
    plots: number;
    ripePlots: number;
    houses: number;
    trees: number;
    windmills: number;
    lighthouses: number;
    villagers: number;
    sheep: number;
    clouds: number;
    flowers: number;
    boats: number;
    beehives: number;
  };
}

export const DOCK_CATEGORIES: { id: DockCategory; label: string }[] = [
  { id: 'plant', label: 'Plant' },
  { id: 'tend', label: 'Tend' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'build', label: 'Build' },
];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // 1. PLANT
  {
    id: 'prepare_bed',
    label: 'Prepare Soil Bed',
    shortLabel: 'Soil Bed',
    category: 'plant',
    description: 'Shape a cedar-framed garden bed ready for seeds (4 Coins)',
    accentBg: 'bg-[#f3e6d3]',
    accentBorder: 'border-[#c9a982]',
    accentText: 'text-[#52391e]',
    coinCost: 4,
    requiredTier: 'first_sprouts',
  },
  {
    id: 'berry_seed',
    label: 'Sweet Berry Seeds',
    shortLabel: 'Berries',
    category: 'plant',
    description: 'Sow ruby berry bushes (4m growth, uses 1 Berry Seed)',
    accentBg: 'bg-[#fae1e6]',
    accentBorder: 'border-[#dfa0ae]',
    accentText: 'text-[#691e30]',
    requiredTier: 'first_sprouts',
  },
  {
    id: 'wheat_seed',
    label: 'Golden Wheat Seeds',
    shortLabel: 'Wheat',
    category: 'plant',
    description: 'Sow golden grain stalks for the mill (8m growth, uses 1 Wheat Seed)',
    accentBg: 'bg-[#faefd4]',
    accentBorder: 'border-[#dfc278]',
    accentText: 'text-[#5e440e]',
    requiredTier: 'first_sprouts',
  },
  {
    id: 'pumpkin_seed',
    label: 'Autumn Pumpkin Seeds',
    shortLabel: 'Pumpkin',
    category: 'plant',
    description: 'Sow heirloom harvest pumpkins (12m growth, uses 1 Pumpkin Seed)',
    accentBg: 'bg-[#fce6d4]',
    accentBorder: 'border-[#e3ad82]',
    accentText: 'text-[#66300e]',
    requiredTier: 'kitchen_garden',
  },
  {
    id: 'flower',
    label: 'Meadow Wildflowers',
    shortLabel: 'Flowers',
    category: 'plant',
    description: 'Nectar blossoms that boost nearby beehive honey (5 Coins)',
    accentBg: 'bg-[#f7e2ec]',
    accentBorder: 'border-[#d9a7c0]',
    accentText: 'text-[#5c2240]',
    coinCost: 5,
    requiredTier: 'first_sprouts',
  },
  {
    id: 'tree',
    label: 'Woodland Tree',
    shortLabel: 'Tree',
    category: 'plant',
    description: 'Plant an oak, pine, or coastal palm tree (8 Coins)',
    accentBg: 'bg-[#dff0d8]',
    accentBorder: 'border-[#a6cfa0]',
    accentText: 'text-[#23451e]',
    coinCost: 8,
    requiredTier: 'first_sprouts',
  },

  // 2. TEND
  {
    id: 'water_can',
    label: 'Watering Can',
    shortLabel: 'Water',
    category: 'tend',
    description: 'Hydrate dry garden beds so crops grow steadily (-1 Water)',
    accentBg: 'bg-[#d9eef7]',
    accentBorder: 'border-[#91c4de]',
    accentText: 'text-[#1b4c66]',
    requiredTier: 'first_sprouts',
  },
  {
    id: 'compost',
    label: 'Rich Compost',
    shortLabel: 'Compost',
    category: 'tend',
    description: 'Enrich plot soil for +25% faster growth and +1 harvest yield (-1 Compost)',
    accentBg: 'bg-[#ebe0d0]',
    accentBorder: 'border-[#bfa684]',
    accentText: 'text-[#4d3920]',
    requiredTier: 'kitchen_garden',
  },
  {
    id: 'greenhouse_bell',
    label: 'Glass Cloche',
    shortLabel: 'Cloche',
    category: 'tend',
    description: 'Fit a miniature glass bell over a plot so crops grow during winter snow (14 Coins)',
    accentBg: 'bg-[#e0f2f7]',
    accentBorder: 'border-[#96c8d6]',
    accentText: 'text-[#1c4b59]',
    coinCost: 14,
    requiredTier: 'flourishing_terrarium',
  },
  {
    id: 'beehive',
    label: 'Meadow Beehive',
    shortLabel: 'Beehive',
    category: 'tend',
    description: 'Painted apiary that pollinates nearby crops and produces honey (18 Coins)',
    accentBg: 'bg-[#faefd4]',
    accentBorder: 'border-[#dfc278]',
    accentText: 'text-[#5e440e]',
    coinCost: 18,
    requiredTier: 'kitchen_garden',
  },
  {
    id: 'sheep',
    label: 'Meadow Sheep',
    shortLabel: 'Sheep',
    category: 'tend',
    description: 'Welcome a grazing woolly sheep to the meadow (14 Coins)',
    accentBg: 'bg-[#f0ece1]',
    accentBorder: 'border-[#cfc5b0]',
    accentText: 'text-[#453d30]',
    coinCost: 14,
    requiredTier: 'kitchen_garden',
  },

  // 3. HARVEST
  {
    id: 'harvest_basket',
    label: 'Harvest Basket',
    shortLabel: 'Harvest',
    category: 'harvest',
    description: 'Click a ripe garden plot or ready beehive to collect produce',
    accentBg: 'bg-[#f7e8c8]',
    accentBorder: 'border-[#dbb872]',
    accentText: 'text-[#5c400e]',
    requiredTier: 'first_sprouts',
  },
  {
    id: 'harvest_all',
    label: 'Gather All Ripe',
    shortLabel: 'Gather All',
    category: 'harvest',
    description: 'Harvest every ripe crop and ready honey across the planet at once',
    accentBg: 'bg-[#dff0d8]',
    accentBorder: 'border-[#a6cfa0]',
    accentText: 'text-[#23451e]',
    instantAction: true,
    requiredTier: 'first_sprouts',
  },
  {
    id: 'remove',
    label: 'Clear Object',
    shortLabel: 'Clear',
    category: 'harvest',
    description: 'Gently clear a removable plot or structure from the planet',
    accentBg: 'bg-[#f7dede]',
    accentBorder: 'border-[#dba4a4]',
    accentText: 'text-[#692626]',
    requiredTier: 'first_sprouts',
  },

  // 4. BUILD
  {
    id: 'windmill',
    label: 'Grain Windmill',
    shortLabel: 'Windmill',
    category: 'build',
    description: 'Timber mill that grinds 2 Wheat into artisan Flour (28 Coins)',
    accentBg: 'bg-[#faefd4]',
    accentBorder: 'border-[#dfc278]',
    accentText: 'text-[#5e440e]',
    coinCost: 28,
    requiredTier: 'village_farm',
  },
  {
    id: 'house',
    label: 'Pastel Cottage',
    shortLabel: 'Cottage',
    category: 'build',
    description: 'Timber-frame home that welcomes 2 villagers (22 Coins)',
    accentBg: 'bg-[#fce6d4]',
    accentBorder: 'border-[#e3ad82]',
    accentText: 'text-[#66300e]',
    coinCost: 22,
    requiredTier: 'village_farm',
  },
  {
    id: 'villager',
    label: 'Invite Villager',
    shortLabel: 'Villager',
    category: 'build',
    description: 'Welcome a helpful Gardener, Miller, or Beekeeper (20 Coins)',
    accentBg: 'bg-[#dff0d8]',
    accentBorder: 'border-[#a6cfa0]',
    accentText: 'text-[#23451e]',
    coinCost: 20,
    requiredTier: 'village_farm',
  },
  {
    id: 'dock',
    label: 'Timber Pier / Bridge',
    shortLabel: 'Pier',
    category: 'build',
    description: 'Shoreline trading pier or arched bridge over water (24 Coins)',
    accentBg: 'bg-[#ebe0d0]',
    accentBorder: 'border-[#bfa684]',
    accentText: 'text-[#4d3920]',
    coinCost: 24,
    requiredTier: 'village_farm',
  },
  {
    id: 'lantern',
    label: 'Lantern Post',
    shortLabel: 'Lantern',
    category: 'build',
    description: 'Warm wrought-iron lamp that illuminates paths at night (8 Coins)',
    accentBg: 'bg-[#faefd4]',
    accentBorder: 'border-[#dfc278]',
    accentText: 'text-[#5e440e]',
    coinCost: 8,
    requiredTier: 'first_sprouts',
  },
  {
    id: 'campfire',
    label: 'Stone Campfire',
    shortLabel: 'Campfire',
    category: 'build',
    description: 'Evening hearth circle where villagers gather at dusk (10 Coins)',
    accentBg: 'bg-[#fce6d4]',
    accentBorder: 'border-[#e3ad82]',
    accentText: 'text-[#66300e]',
    coinCost: 10,
    requiredTier: 'kitchen_garden',
  },
  {
    id: 'lighthouse',
    label: 'Coastal Lighthouse',
    shortLabel: 'Lighthouse',
    category: 'build',
    description: 'Striped beacon tower with rotating night beam (26 Coins)',
    accentBg: 'bg-[#fae1e6]',
    accentBorder: 'border-[#dfa0ae]',
    accentText: 'text-[#691e30]',
    coinCost: 26,
    requiredTier: 'flourishing_terrarium',
  },
  {
    id: 'sailboat',
    label: 'Wooden Sailboat',
    shortLabel: 'Sailboat',
    category: 'build',
    description: 'Launch a lantern-lit skiff onto the turquoise sea (16 Coins)',
    accentBg: 'bg-[#d9eef7]',
    accentBorder: 'border-[#91c4de]',
    accentText: 'text-[#1b4c66]',
    coinCost: 16,
    requiredTier: 'village_farm',
  },
  {
    id: 'raise',
    label: 'Raise Terrain',
    shortLabel: 'Raise',
    category: 'build',
    description: 'Gently elevate terrain facets into hills (2 Coins)',
    accentBg: 'bg-[#dff0d8]',
    accentBorder: 'border-[#a6cfa0]',
    accentText: 'text-[#23451e]',
    coinCost: 2,
    requiredTier: 'first_sprouts',
  },
  {
    id: 'lower',
    label: 'Carve Pond Basin',
    shortLabel: 'Lower',
    category: 'build',
    description: 'Lower terrain facets into tranquil water basins (2 Coins)',
    accentBg: 'bg-[#d9eef7]',
    accentBorder: 'border-[#91c4de]',
    accentText: 'text-[#1b4c66]',
    coinCost: 2,
    requiredTier: 'first_sprouts',
  },
];
