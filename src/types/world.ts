export type DockCategory = 'plant' | 'tend' | 'harvest' | 'build';

export type CropType = 'wheat' | 'pumpkin' | 'berry';

export type ToolId =
  // 1. PLANT category (Seeds & Flora)
  | 'wheat_seed'
  | 'pumpkin_seed'
  | 'berry_seed'
  | 'flower'
  | 'tree'
  // 2. TEND category (Watering, Composting, Pollination & Weather Care)
  | 'water_can'
  | 'compost'
  | 'cloud'
  | 'beehive'
  | 'sheep'
  // 3. HARVEST category (Gathering & Pruning)
  | 'harvest_basket'
  | 'harvest_all'
  | 'remove'
  // 4. BUILD category (Cottages, Landmarks, Coastal & Terrain)
  | 'house'
  | 'windmill'
  | 'lighthouse'
  | 'watchtower'
  | 'campfire'
  | 'lantern'
  | 'dock'
  | 'sailboat'
  | 'villager'
  | 'raise'
  | 'lower'
  // Additional legacy/scenic tools supported by controller
  | 'mountain'
  | 'lake'
  | 'duck'
  | 'balloon'
  | 'rainbow'
  | 'snowcloud'
  | 'shootingstar';

export type CameraViewId = 'orb' | 'surface' | 'orbit' | 'village';

export type TimeMode = 'auto' | 'day' | 'twilight' | 'night';

export type WeatherSummary = 'Clear Breeze' | 'Gentle Rain' | 'Soft Snow';

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

export interface SelectedPlotInfo {
  kind: 'plot';
  id: string;
  cropType: CropType;
  cropLabel: string;
  stage: 'Sprouting' | 'Growing' | 'Ripe';
  growthPct: number;
  moisturePct: number;
  composted: boolean;
  pollinated: boolean;
}

export interface SelectedBuildingInfo {
  kind: 'building';
  id: string;
  buildingType: string;
  title: string;
  subtitle: string;
  harmonyBonus: string;
  actionLabel: string;
  actionDescription: string;
  removable: boolean;
}

export interface SelectedVillagerInfo {
  kind: 'villager';
  id: string;
  name: string;
  role: VillagerRole;
  assignment: VillagerAssignment;
  activity: string;
}

export type SelectedEntityInfo =
  | SelectedPlotInfo
  | SelectedBuildingInfo
  | SelectedVillagerInfo;

export interface HarvestFeedbackBatch {
  wheat: number;
  pumpkin: number;
  berry: number;
  honey: number;
  flour: number;
}

export interface WorldState {
  planetName: string;
  population: number;
  happiness: number;
  dayCount: number;
  activeTool: ToolId | null;
  activeView: CameraViewId;
  timeMode: TimeMode;
  /** 0..1 where 0.25 = warm noon/afternoon, 0.52 = blue twilight, 0.78 = deep night */
  timeOfDay: number;
  weatherSummary: WeatherSummary;
  tourActive: boolean;
  tourElapsed: number;
  tourPhase: string;
  reducedMotion: boolean;
  selectedEntity: SelectedEntityInfo | null;
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

export interface ToolDefinition {
  id: ToolId;
  label: string;
  shortLabel: string;
  category: DockCategory;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  description: string;
  instantAction?: boolean;
}

export const DOCK_CATEGORIES: {
  id: DockCategory;
  label: string;
  subtitle: string;
}[] = [
  {
    id: 'plant',
    label: 'Plant',
    subtitle: 'Sow crop plots, meadow blossoms, and saplings',
  },
  {
    id: 'tend',
    label: 'Tend',
    subtitle: 'Water soil, enrich with compost, and nurture life',
  },
  {
    id: 'harvest',
    label: 'Harvest',
    subtitle: 'Gather ripe crops or gently prune the land',
  },
  {
    id: 'build',
    label: 'Build',
    subtitle: 'Place cozy cottages, landmarks, and shape terrain',
  },
];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ===========================================================================
  // 1. PLANT (Seeds & Flora)
  // ===========================================================================
  {
    id: 'wheat_seed',
    label: 'Golden Wheat',
    shortLabel: 'Wheat',
    category: 'plant',
    accentBg: 'bg-[#f7ebc6]',
    accentBorder: 'border-[#d9be72]',
    accentText: 'text-[#59440e]',
    description: 'Plant a neat garden plot of golden grain stalks',
  },
  {
    id: 'pumpkin_seed',
    label: 'Sunlit Pumpkin',
    shortLabel: 'Pumpkin',
    category: 'plant',
    accentBg: 'bg-[#fde2c8]',
    accentBorder: 'border-[#e6a46e]',
    accentText: 'text-[#69330c]',
    description: 'Plant a warm patch of heirloom pumpkins and vines',
  },
  {
    id: 'berry_seed',
    label: 'Sweet Berries',
    shortLabel: 'Berries',
    category: 'plant',
    accentBg: 'bg-[#f7dce4]',
    accentBorder: 'border-[#de9ab0]',
    accentText: 'text-[#662038]',
    description: 'Plant a berry bush plot that ripens with sweet fruit',
  },
  {
    id: 'flower',
    label: 'Wildflowers',
    shortLabel: 'Flowers',
    category: 'plant',
    accentBg: 'bg-[#f2dff7]',
    accentBorder: 'border-[#cfa4dc]',
    accentText: 'text-[#52265c]',
    description: 'Scatter pastel meadow blossoms for bees and villagers',
  },
  {
    id: 'tree',
    label: 'Sapling Tree',
    shortLabel: 'Sapling',
    category: 'plant',
    accentBg: 'bg-[#dff0d8]',
    accentBorder: 'border-[#a2cc9b]',
    accentText: 'text-[#264d22]',
    description: 'Plant oaks on hills, pines on peaks, or coastal palms',
  },

  // ===========================================================================
  // 2. TEND (Watering, Composting, Pollination & Care)
  // ===========================================================================
  {
    id: 'water_can',
    label: 'Watering Can',
    shortLabel: 'Water',
    category: 'tend',
    accentBg: 'bg-[#d9eef7]',
    accentBorder: 'border-[#91c4de]',
    accentText: 'text-[#1b4c66]',
    description: 'Hydrate garden plots and nourish nearby trees',
  },
  {
    id: 'compost',
    label: 'Rich Compost',
    shortLabel: 'Compost',
    category: 'tend',
    accentBg: 'bg-[#ebe0d0]',
    accentBorder: 'border-[#bfa684]',
    accentText: 'text-[#4d3920]',
    description: 'Enrich plot soil to double harvest yield and speed growth',
  },
  {
    id: 'cloud',
    label: 'Rain Cloud',
    shortLabel: 'Rain',
    category: 'tend',
    accentBg: 'bg-[#e1ecf7]',
    accentBorder: 'border-[#a4c2e3]',
    accentText: 'text-[#264669]',
    description: 'Summon a gentle rain cloud that waters plots along its path',
  },
  {
    id: 'beehive',
    label: 'Apiary Hive',
    shortLabel: 'Beehive',
    category: 'tend',
    accentBg: 'bg-[#fcf0c2]',
    accentBorder: 'border-[#e3c76b]',
    accentText: 'text-[#5e480d]',
    description: 'Place a painted beehive that pollinates nearby garden plots',
  },
  {
    id: 'sheep',
    label: 'Grazing Sheep',
    shortLabel: 'Sheep',
    category: 'tend',
    accentBg: 'bg-[#f2efe9]',
    accentBorder: 'border-[#ccc5b8]',
    accentText: 'text-[#474137]',
    description: 'Add a woolly sheep that grazes the meadow',
  },

  // ===========================================================================
  // 3. HARVEST (Basket, Gather All & Prune)
  // ===========================================================================
  {
    id: 'harvest_basket',
    label: 'Harvest Basket',
    shortLabel: 'Basket',
    category: 'harvest',
    accentBg: 'bg-[#f7e8c8]',
    accentBorder: 'border-[#dbb872]',
    accentText: 'text-[#5c400e]',
    description: 'Click a plot or beehive to gather ripe crops and honey',
  },
  {
    id: 'harvest_all',
    label: 'Gather All Ripe',
    shortLabel: 'Gather All',
    category: 'harvest',
    accentBg: 'bg-[#dcedd4]',
    accentBorder: 'border-[#9ec78d]',
    accentText: 'text-[#23471b]',
    description: 'Collect all ripe plots and honey across the planet at once',
    instantAction: true,
  },
  {
    id: 'remove',
    label: 'Prune & Clear',
    shortLabel: 'Prune',
    category: 'harvest',
    accentBg: 'bg-[#f7dede]',
    accentBorder: 'border-[#dfa4a4]',
    accentText: 'text-[#692626]',
    description: 'Gently clear a plot, plant, or structure from the surface',
  },

  // ===========================================================================
  // 4. BUILD (Village Structures, Paths, Boats & Terrain)
  // ===========================================================================
  {
    id: 'house',
    label: 'Pastel Cottage',
    shortLabel: 'Cottage',
    category: 'build',
    accentBg: 'bg-[#fce4d6]',
    accentBorder: 'border-[#ebb69b]',
    accentText: 'text-[#6e3820]',
    description: 'Build a cozy cottage with roof tiles and two villagers',
  },
  {
    id: 'windmill',
    label: 'Grain Windmill',
    shortLabel: 'Windmill',
    category: 'build',
    accentBg: 'bg-[#fdf2d0]',
    accentBorder: 'border-[#e5cc87]',
    accentText: 'text-[#665014]',
    description: 'Erect a white windmill with turning canvas sails',
  },
  {
    id: 'campfire',
    label: 'Hearth Campfire',
    shortLabel: 'Campfire',
    category: 'build',
    accentBg: 'bg-[#fde2c8]',
    accentBorder: 'border-[#eba972]',
    accentText: 'text-[#70360f]',
    description: 'Light a warm stone campfire where villagers gather at dusk',
  },
  {
    id: 'lantern',
    label: 'Lantern Path',
    shortLabel: 'Lantern',
    category: 'build',
    accentBg: 'bg-[#fef0c9]',
    accentBorder: 'border-[#e5c777]',
    accentText: 'text-[#634b10]',
    description: 'Place a wrought-iron streetlamp and cobblestone path',
  },
  {
    id: 'dock',
    label: 'Pier & Bridge',
    shortLabel: 'Pier',
    category: 'build',
    accentBg: 'bg-[#efe4d4]',
    accentBorder: 'border-[#cbb393]',
    accentText: 'text-[#543d22]',
    description: 'Build a shoreline pier or an arched footbridge over water',
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    shortLabel: 'Beacon',
    category: 'build',
    accentBg: 'bg-[#fadadd]',
    accentBorder: 'border-[#e59fa6]',
    accentText: 'text-[#70232b]',
    description: 'Build a striped coastal lighthouse with sweeping beam',
  },
  {
    id: 'sailboat',
    label: 'Sailboat',
    shortLabel: 'Boat',
    category: 'build',
    accentBg: 'bg-[#d6eff7]',
    accentBorder: 'border-[#8ec9de]',
    accentText: 'text-[#1c5166]',
    description: 'Launch a wooden sailboat on the turquoise sea',
  },
  {
    id: 'villager',
    label: 'Welcome Villager',
    shortLabel: 'Villager',
    category: 'build',
    accentBg: 'bg-[#fde8c8]',
    accentBorder: 'border-[#e6be83]',
    accentText: 'text-[#664414]',
    description: 'Invite a new villager to help tend plots and mills',
  },
  {
    id: 'raise',
    label: 'Raise Meadow',
    shortLabel: 'Raise',
    category: 'build',
    accentBg: 'bg-[#e6eed6]',
    accentBorder: 'border-[#b5c993]',
    accentText: 'text-[#3b4f1d]',
    description: 'Gently elevate terrain facets into grassy hills',
  },
  {
    id: 'lower',
    label: 'Carve Pond',
    shortLabel: 'Pond',
    category: 'build',
    accentBg: 'bg-[#d8edf2]',
    accentBorder: 'border-[#96c9d6]',
    accentText: 'text-[#20515e]',
    description: 'Lower terrain facets to form tranquil turquoise water',
  },
];
