import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Apple,
  ArrowDownToLine,
  ArrowUpFromLine,
  Award,
  Bug,
  Camera,
  Check,
  CloudRain,
  CloudSnow,
  Coins,
  Compass,
  Download,
  Droplets,
  Eraser,
  Fan,
  Flame,
  Flower2,
  Hammer,
  Home,
  LampFloor,
  Leaf,
  Lock,
  Menu,
  Moon,
  Package,
  Play,
  RotateCcw,
  Sailboat,
  Save,
  Shovel,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Sunset,
  TowerControl,
  Trees,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wheat,
  Wind,
  X,
} from 'lucide-react';
import {
  BUILDING_COSTS,
  CROP_CONFIG,
  MILESTONE_DEFINITIONS,
  PROGRESSION_TIERS,
  SELL_PRICES,
} from './config/farmConfig';
import { PocketWorldController } from './three/PocketWorldScene';
import {
  CameraViewId,
  CropType,
  DOCK_CATEGORIES,
  DockCategory,
  HarvestFeedbackBatch,
  TimeMode,
  TOOL_DEFINITIONS,
  ToolId,
  VillagerAssignment,
  VillagerRole,
  WeatherPhase,
  WorldState,
} from './types/world';
import { soundEngine } from './utils/sound';

type SecondaryMenuTab = 'inventory' | 'milestones' | 'camera' | 'settings';

const VILLAGER_ROLE_OPTIONS: VillagerRole[] = [
  'Gardener',
  'Miller',
  'Beekeeper',
  'Builder',
  'Forager',
];

const VILLAGER_ASSIGNMENT_OPTIONS: VillagerAssignment[] = [
  'Meadow Plots',
  'Windmill & Granary',
  'Apiary & Orchards',
  'Village Commons',
  'Coastal Pier',
];

const TIER_ORDER = PROGRESSION_TIERS.map((t) => t.id);

function isTierAtLeast(currentTier: string, requiredTier?: string): boolean {
  if (!requiredTier) return true;
  return TIER_ORDER.indexOf(currentTier as never) >= TIER_ORDER.indexOf(requiredTier as never);
}

function getTierTitle(tierId?: string): string {
  return PROGRESSION_TIERS.find((t) => t.id === tierId)?.title || 'First Sprouts';
}

function renderCategoryIcon(category: DockCategory) {
  const cls = 'w-4 h-4 shrink-0';
  switch (category) {
    case 'plant':
      return <Sprout className={cls} />;
    case 'tend':
      return <Droplets className={cls} />;
    case 'harvest':
      return <ShoppingBasket className={cls} />;
    case 'build':
      return <Hammer className={cls} />;
  }
}

function renderToolIcon(id: ToolId) {
  const cls = 'w-4 h-4 shrink-0';
  switch (id) {
    case 'prepare_bed':
      return <Shovel className={cls} />;
    case 'wheat_seed':
      return <Wheat className={cls} />;
    case 'pumpkin_seed':
      return <Leaf className={cls} />;
    case 'berry_seed':
      return <Apple className={cls} />;
    case 'flower':
      return <Flower2 className={cls} />;
    case 'tree':
      return <Trees className={cls} />;
    case 'water_can':
      return <Droplets className={cls} />;
    case 'compost':
      return <Shovel className={cls} />;
    case 'greenhouse_bell':
      return <Sparkles className={cls} />;
    case 'cloud':
      return <CloudRain className={cls} />;
    case 'beehive':
      return <Bug className={cls} />;
    case 'sheep':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cls}
          aria-hidden="true"
        >
          <path d="M8 15a4 4 0 0 1-2-7.5 4.5 4.5 0 0 1 8.5-1A3.5 3.5 0 0 1 18 10a3.5 3.5 0 0 1-1 6.8H8Z" />
          <path d="M9 17v3" />
          <path d="M15 17v3" />
        </svg>
      );
    case 'harvest_basket':
      return <ShoppingBasket className={cls} />;
    case 'harvest_all':
      return <Sparkles className={cls} />;
    case 'remove':
      return <Eraser className={cls} />;
    case 'house':
      return <Home className={cls} />;
    case 'windmill':
      return <Fan className={cls} />;
    case 'lighthouse':
      return <TowerControl className={cls} />;
    case 'campfire':
      return <Flame className={cls} />;
    case 'lantern':
      return <LampFloor className={cls} />;
    case 'dock':
      return <Anchor className={cls} />;
    case 'sailboat':
      return <Sailboat className={cls} />;
    case 'villager':
      return <Users className={cls} />;
    case 'raise':
      return <ArrowUpFromLine className={cls} />;
    case 'lower':
      return <ArrowDownToLine className={cls} />;
    default:
      return <Sprout className={cls} />;
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PocketWorldController | null>(null);
  const harvestTimerRef = useRef<number | null>(null);

  const [worldState, setWorldState] = useState<WorldState>({
    planetName: 'Little Meadow',
    population: 12,
    happiness: 96,
    dayCount: 1,
    activeTool: null,
    activeView: 'orb',
    timeMode: 'auto',
    timeOfDay: 0.24,
    weatherSummary: 'Clear Breeze',
    weatherPhase: 'clear',
    weatherOverride: null,
    season: 'spring',
    tourActive: false,
    tourElapsed: 0,
    tourPhase: '',
    reducedMotion: false,
    selectedEntity: null,
    coins: 28,
    gardenPoints: 18,
    progressionTier: 'first_sprouts',
    progressionTierLabel: 'First Sprouts',
    nextTierLabel: 'Kitchen Garden',
    nextTierPoints: 45,
    autoReplantUnlocked: false,
    autoReplantEnabled: false,
    canClaimFreeSeeds: false,
    seedsByCrop: {
      berry: 5,
      wheat: 4,
      pumpkin: 2,
    },
    resources: {
      seeds: 11,
      water: 18,
      compost: 6,
      harvestTotal: 6,
    },
    inventory: {
      wheat: 3,
      pumpkin: 1,
      berry: 2,
      honey: 1,
      flour: 1,
    },
    stats: {
      totalPlanted: 6,
      totalHarvested: 6,
      totalTended: 4,
    },
    objectCounts: {
      plots: 6,
      ripePlots: 2,
      houses: 10,
      trees: 24,
      windmills: 1,
      lighthouses: 2,
      villagers: 12,
      sheep: 8,
      clouds: 3,
      flowers: 7,
      boats: 3,
      beehives: 2,
    },
    completedMilestones: [],
    statusMessage: null,
    lastSavedAt: null,
  });

  // Expandable dock state: only one category expanded at a time
  const [expandedCategory, setExpandedCategory] = useState<DockCategory | null>(
    null,
  );

  // Secondary menu state (Inventory, Milestones, Camera, Settings)
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<SecondaryMenuTab>('inventory');

  // Sound settings state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.45);

  // Save/Import JSON panel inside Settings
  const [showSaveTransfer, setShowSaveTransfer] = useState(false);
  const [saveJsonBuffer, setSaveJsonBuffer] = useState('');

  // Grouped Harvest Feedback state (merges consecutive harvests into one subtle banner)
  const [harvestToast, setHarvestToast] = useState<HarvestFeedbackBatch | null>(
    null,
  );

  const [webglLost, setWebglLost] = useState(false);

  const handleHarvestFeedback = useCallback(
    (batch: Partial<HarvestFeedbackBatch>) => {
      setHarvestToast((prev) => ({
        wheat: (prev?.wheat || 0) + (batch.wheat || 0),
        pumpkin: (prev?.pumpkin || 0) + (batch.pumpkin || 0),
        berry: (prev?.berry || 0) + (batch.berry || 0),
        honey: (prev?.honey || 0) + (batch.honey || 0),
        flour: (prev?.flour || 0) + (batch.flour || 0),
      }));

      if (harvestTimerRef.current !== null) {
        window.clearTimeout(harvestTimerRef.current);
      }
      harvestTimerRef.current = window.setTimeout(() => {
        setHarvestToast(null);
        harvestTimerRef.current = null;
      }, 4200);
    },
    [],
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const controller = new PocketWorldController(
      container,
      setWorldState,
      handleHarvestFeedback,
    );
    controllerRef.current = controller;

    const canvas = container.querySelector('canvas');
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => {
      setWebglLost(false);
    };

    if (canvas) {
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);
    }

    return () => {
      if (harvestTimerRef.current !== null) {
        window.clearTimeout(harvestTimerRef.current);
      }
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
      }
      controller.dispose();
      controllerRef.current = null;
    };
  }, [handleHarvestFeedback]);

  // Keyboard Escape handler: collapses expanded dock tray, exits active tool, or closes menu/contextual panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (expandedCategory !== null) {
          setExpandedCategory(null);
          return;
        }
        if (worldState.activeTool !== null) {
          controllerRef.current?.setTool(null);
          return;
        }
        if (worldState.selectedEntity !== null) {
          controllerRef.current?.clearSelection();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    menuOpen,
    expandedCategory,
    worldState.activeTool,
    worldState.selectedEntity,
  ]);

  const handleToggleCategory = (cat: DockCategory) => {
    soundEngine.playSelect();
    setMenuOpen(false);
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  const handleSelectTool = (tool: ToolId) => {
    const def = TOOL_DEFINITIONS.find((t) => t.id === tool);
    if (def?.instantAction) {
      controllerRef.current?.setTool(tool);
      setExpandedCategory(null);
      return;
    }
    const nextTool = worldState.activeTool === tool ? null : tool;
    controllerRef.current?.setTool(nextTool);
    soundEngine.playSelect();
    // Collapse the tray once a tool is chosen so the planet stays unobstructed
    setExpandedCategory(null);
  };

  const handleExitToolMode = () => {
    controllerRef.current?.setTool(null);
    soundEngine.playSelect();
  };

  const handleCanvasPointerDown = () => {
    // Clicking outside the interface onto the 3D canvas collapses any open dock tray or secondary menu
    if (expandedCategory !== null) {
      setExpandedCategory(null);
    }
    if (menuOpen) {
      setMenuOpen(false);
    }
  };

  const handleSelectView = (view: CameraViewId) => {
    controllerRef.current?.stopTour();
    controllerRef.current?.applyCameraPreset(view);
    soundEngine.playSelect();
  };

  const handleSelectTimeMode = (mode: TimeMode) => {
    controllerRef.current?.setTimeMode(mode);
    soundEngine.playSelect();
  };

  const handleToggleTour = () => {
    setMenuOpen(false);
    setExpandedCategory(null);
    if (worldState.tourActive) {
      controllerRef.current?.stopTour();
    } else {
      controllerRef.current?.startTour();
    }
  };

  const activeToolDef = worldState.activeTool
    ? TOOL_DEFINITIONS.find((t) => t.id === worldState.activeTool) || null
    : null;

  const activeCategoryForHighlight: DockCategory | null =
    expandedCategory || (activeToolDef ? activeToolDef.category : null);

  const trayTools = expandedCategory
    ? TOOL_DEFINITIONS.filter((t) => t.category === expandedCategory)
    : [];

  // Format Time of Day label
  const timePhaseLabel =
    worldState.timeOfDay < 0.38
      ? 'Sunlit Day'
      : worldState.timeOfDay < 0.64
        ? 'Golden Dusk'
        : worldState.timeOfDay < 0.88
          ? 'Starry Night'
          : 'Morning Dew';

  const seasonLabel =
    worldState.season.charAt(0).toUpperCase() + worldState.season.slice(1);

  // Format Grouped Harvest Toast copy
  const harvestSummaryParts: string[] = [];
  if (harvestToast) {
    if (harvestToast.wheat > 0)
      harvestSummaryParts.push(`+${harvestToast.wheat} Wheat`);
    if (harvestToast.pumpkin > 0)
      harvestSummaryParts.push(`+${harvestToast.pumpkin} Pumpkin`);
    if (harvestToast.berry > 0)
      harvestSummaryParts.push(`+${harvestToast.berry} Berries`);
    if (harvestToast.honey > 0)
      harvestSummaryParts.push(`+${harvestToast.honey} Honey`);
    if (harvestToast.flour > 0)
      harvestSummaryParts.push(`+${harvestToast.flour} Flour`);
  }

  const totalPantryItems =
    worldState.inventory.berry +
    worldState.inventory.wheat +
    worldState.inventory.pumpkin +
    worldState.inventory.honey +
    worldState.inventory.flour;

  const totalCropProduce =
    worldState.inventory.berry +
    worldState.inventory.wheat +
    worldState.inventory.pumpkin;

  const getToolSubLabel = (toolId: ToolId, instantAction?: boolean): string => {
    switch (toolId) {
      case 'berry_seed':
        return `${worldState.seedsByCrop.berry} pkt · ${CROP_CONFIG.berry.seedCoinCost}c`;
      case 'wheat_seed':
        return `${worldState.seedsByCrop.wheat} pkt · ${CROP_CONFIG.wheat.seedCoinCost}c`;
      case 'pumpkin_seed':
        return `${worldState.seedsByCrop.pumpkin} pkt · ${CROP_CONFIG.pumpkin.seedCoinCost}c`;
      case 'water_can':
        return `${worldState.resources.water}/20 Water`;
      case 'compost':
        return `${worldState.resources.compost} Compost`;
      case 'harvest_all':
        return `${worldState.objectCounts.ripePlots} Ripe`;
      default: {
        const coinCost = BUILDING_COSTS[toolId];
        if (coinCost && coinCost > 0) return `${coinCost} Coins`;
        return instantAction ? 'Instant' : 'Select';
      }
    }
  };

  const transitionClass = worldState.reducedMotion
    ? ''
    : 'transition-all duration-200 ease-out';

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#221d2b]">
      {/* =====================================================================
          1. FULL-VIEWPORT 3D TERRARIUM CANVAS (Visual Focus)
      ===================================================================== */}
      <div
        ref={mountRef}
        onPointerDown={handleCanvasPointerDown}
        className={`w-full h-full ${
          worldState.activeTool
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        aria-label="Interactive 3D Pocket World Terrarium Planet"
      />

      {/* WebGL Context Lost Fallback */}
      {webglLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#231e2d]/95 text-[#faf6ee] p-4">
          <div className="max-w-md p-6 text-center bg-[#322b3f] rounded-2xl border border-white/10">
            <h2 className="text-xl font-semibold mb-2">
              Terrarium Viewport Paused
            </h2>
            <p className="text-sm text-[#d6cee2]">
              The 3D WebGL context was interrupted. Reload or restore the tab to
              resume tending {worldState.planetName}.
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. TOP COMPACT STATUS STRIP (Time, Season/Weather, Resources & Menu)
      ===================================================================== */}
      {!worldState.tourActive && (
        <header
          aria-label="Terrarium status strip"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[96vw]"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-2xl bg-[#faf5ec] text-[#382f27] border border-[#e0d4c0] shadow-lg">
            {/* Planet Name */}
            <span className="font-display text-sm font-semibold text-[#2b221b] whitespace-nowrap px-1">
              {worldState.planetName}
            </span>

            <span className="text-[#cbbba3]" aria-hidden="true">
              ·
            </span>

            {/* Day, Season & Time of Day */}
            <button
              type="button"
              onClick={() => controllerRef.current?.cycleTimeMode()}
              title="Click to cycle time of day"
              className="min-h-[36px] px-2 py-1 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#4a3f34] hover:bg-[#efe6d8] cursor-pointer whitespace-nowrap"
            >
              {worldState.timeOfDay < 0.38 ? (
                <Sun className="w-3.5 h-3.5 text-[#c77d18] shrink-0" />
              ) : worldState.timeOfDay < 0.64 ? (
                <Sunset className="w-3.5 h-3.5 text-[#b85d38] shrink-0" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#496594] shrink-0" />
              )}
              <span className="font-mono-tabular">
                Day {worldState.dayCount}
              </span>
              <span className="hidden md:inline text-[#7a6b5a]">
                · {seasonLabel} · {timePhaseLabel}
              </span>
            </button>

            {/* Weather (Click to gently cycle weather or resume natural cycle) */}
            <button
              type="button"
              onClick={() => controllerRef.current?.cycleWeather()}
              title={
                worldState.weatherOverride
                  ? 'Scenic weather override active (click to cycle)'
                  : 'Natural weather cycle (click to override)'
              }
              className="min-h-[36px] px-2 py-1 rounded-xl hidden lg:flex items-center gap-1.5 text-xs font-medium text-[#4a3f34] hover:bg-[#efe6d8] cursor-pointer whitespace-nowrap"
            >
              {worldState.weatherPhase === 'rain' ? (
                <CloudRain className="w-3.5 h-3.5 text-[#386fa4] shrink-0" />
              ) : worldState.weatherPhase === 'snow' ? (
                <CloudSnow className="w-3.5 h-3.5 text-[#4a7c9b] shrink-0" />
              ) : (
                <Wind className="w-3.5 h-3.5 text-[#4d7c43] shrink-0" />
              )}
              <span>{worldState.weatherSummary}</span>
            </button>

            <span className="text-[#cbbba3]" aria-hidden="true">
              ·
            </span>

            {/* Compact Resources (Coins, Garden Points, Seeds, Water, Compost) */}
            <div
              className="flex items-center gap-2 sm:gap-2.5 px-1 text-xs font-mono-tabular text-[#4a3f34] whitespace-nowrap"
              aria-label="Available resources"
            >
              <span
                className="flex items-center gap-1"
                title="Coins for seeds, beds, and village structures"
              >
                <Coins className="w-3.5 h-3.5 text-[#b87b1c] shrink-0" />
                <span className="hidden xl:inline text-[#6e5f4f]">Coins</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.coins}
                </strong>
              </span>

              <span
                className="hidden sm:flex items-center gap-1"
                title={`Garden Points · Tier: ${worldState.progressionTierLabel}`}
              >
                <Award className="w-3.5 h-3.5 text-[#3e7535] shrink-0" />
                <span className="hidden xl:inline text-[#6e5f4f]">GP</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.gardenPoints}
                </strong>
              </span>

              <span
                className="flex items-center gap-1"
                title={`Seeds: ${worldState.seedsByCrop.berry} Berry, ${worldState.seedsByCrop.wheat} Wheat, ${worldState.seedsByCrop.pumpkin} Pumpkin`}
              >
                <Sprout className="w-3.5 h-3.5 text-[#3f7036] shrink-0" />
                <span className="hidden xl:inline text-[#6e5f4f]">Seeds</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.seeds}
                </strong>
              </span>

              <span
                className="flex items-center gap-1"
                title="Watering can reserves (refill at Stone Well or Pond)"
              >
                <Droplets className="w-3.5 h-3.5 text-[#2d6fa3] shrink-0" />
                <span className="hidden xl:inline text-[#6e5f4f]">Water</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.water}
                </strong>
              </span>

              <span
                className="hidden md:flex items-center gap-1"
                title="Rich compost for enriching soil (+25% speed & +1 yield)"
              >
                <Shovel className="w-3.5 h-3.5 text-[#7a542e] shrink-0" />
                <span className="hidden xl:inline text-[#6e5f4f]">Compost</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.compost}
                </strong>
              </span>
            </div>

            <span className="text-[#cbbba3]" aria-hidden="true">
              ·
            </span>

            {/* Secondary Menu Button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playSelect();
                setExpandedCategory(null);
                setMenuOpen((prev) => !prev);
              }}
              aria-expanded={menuOpen}
              aria-label="Open secondary menu for inventory, milestones, camera, and settings"
              className={`min-h-[38px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-semibold border cursor-pointer whitespace-nowrap ${transitionClass} ${
                menuOpen
                  ? 'bg-[#382f27] text-[#fcf8f0] border-[#261f19]'
                  : 'bg-[#f0e8da] text-[#382f27] border-[#dcd0bc] hover:bg-[#e6dccb]'
              }`}
            >
              <Menu className="w-3.5 h-3.5 shrink-0" />
              <span>Menu</span>
            </button>
          </div>
        </header>
      )}

      {/* =====================================================================
          3. SMALL SECONDARY MENU (Inventory, Milestones, Camera, Settings)
      ===================================================================== */}
      {!worldState.tourActive && menuOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="World Menu"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-md bg-[#faf5ec] text-[#382f27] rounded-2xl border border-[#dfd3bf] shadow-2xl overflow-hidden"
        >
          {/* Secondary Menu Header & Tabs */}
          <div className="px-3.5 pt-3 pb-2 border-b border-[#e8dfd0] flex items-center justify-between gap-2">
            <div
              className="flex items-center gap-1 bg-[#efe7d8] p-1 rounded-xl flex-1"
              role="tablist"
            >
              {(
                [
                  {
                    id: 'inventory',
                    label: 'Pantry',
                    icon: <Package className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'milestones',
                    label: 'Progress',
                    icon: <Award className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'camera',
                    label: 'Camera',
                    icon: <Camera className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'settings',
                    label: 'Settings',
                    icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
                  },
                ] as {
                  id: SecondaryMenuTab;
                  label: string;
                  icon: React.ReactNode;
                }[]
              ).map((t) => {
                const active = menuTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      soundEngine.playSelect();
                      setMenuTab(t.id);
                    }}
                    className={`flex-1 min-h-[36px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${transitionClass} ${
                      active
                        ? 'bg-[#faf5ec] text-[#2b221b] shadow-xs font-semibold'
                        : 'text-[#635547] hover:text-[#2b221b]'
                    }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close Menu"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-[#594d40] hover:bg-[#eae1d3] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="p-4 max-h-[70vh] overflow-y-auto">
            {menuTab === 'inventory' && (
              <div className="flex flex-col gap-3.5">
                {/* Summary Row */}
                <div className="flex items-center justify-between text-xs text-[#695b4c]">
                  <span className="font-semibold text-[#2b221b]">
                    Pantry & Market ({worldState.coins} Coins)
                  </span>
                  <span className="font-mono-tabular">
                    {worldState.objectCounts.plots} Beds ·{' '}
                    {worldState.objectCounts.ripePlots} Ripe
                  </span>
                </div>

                {/* Gathered Goods with Sell Buttons */}
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {(
                    [
                      {
                        key: 'berry',
                        label: 'Sweet Berries',
                        count: worldState.inventory.berry,
                        price: SELL_PRICES.berry,
                      },
                      {
                        key: 'wheat',
                        label: 'Golden Wheat',
                        count: worldState.inventory.wheat,
                        price: SELL_PRICES.wheat,
                      },
                      {
                        key: 'pumpkin',
                        label: 'Heirloom Pumpkins',
                        count: worldState.inventory.pumpkin,
                        price: SELL_PRICES.pumpkin,
                      },
                      {
                        key: 'honey',
                        label: 'Meadow Honey',
                        count: worldState.inventory.honey,
                        price: SELL_PRICES.honey,
                      },
                      {
                        key: 'flour',
                        label: 'Mill Flour',
                        count: worldState.inventory.flour,
                        price: SELL_PRICES.flour,
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="px-3 py-2 rounded-xl bg-[#f2eadb] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[#4a3f34] font-medium">
                          {item.label}
                        </span>
                        <strong className="font-mono-tabular text-sm font-semibold text-[#2b221b]">
                          ×{item.count}
                        </strong>
                      </div>
                      <button
                        type="button"
                        disabled={item.count <= 0}
                        onClick={() =>
                          controllerRef.current?.sellProduce(item.key, 1)
                        }
                        className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono-tabular cursor-pointer ${
                          item.count > 0
                            ? 'bg-[#e6d6b8] hover:bg-[#dbc69e] text-[#473314]'
                            : 'bg-[#e8e0d2] text-[#9e9181] cursor-not-allowed'
                        }`}
                      >
                        Sell 1 (+{item.price}c)
                      </button>
                    </div>
                  ))}
                </div>

                {totalPantryItems > 0 && (
                  <button
                    type="button"
                    onClick={() => controllerRef.current?.sellAllProduce()}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#f7e8c8] hover:bg-[#f0dcaf] text-[#5c400e] border border-[#dbb872] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Sell All Pantry Goods</span>
                  </button>
                )}

                {/* Seed Packets & Purchasing */}
                <div className="pt-2 border-t border-[#e8dfd0] flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#2b221b]">
                    Seed Packets
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {(['berry', 'wheat', 'pumpkin'] as CropType[]).map(
                      (crop) => {
                        const cfg = CROP_CONFIG[crop];
                        const count = worldState.seedsByCrop[crop];
                        const unlocked = isTierAtLeast(
                          worldState.progressionTier,
                          cfg.unlockTier,
                        );
                        return (
                          <div
                            key={crop}
                            className="p-2 rounded-xl bg-[#f2eadb] flex flex-col justify-between gap-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-[#382f27] capitalize">
                                {crop}
                              </span>
                              <strong className="font-mono-tabular text-[#2b221b]">
                                {count}
                              </strong>
                            </div>
                            <button
                              type="button"
                              disabled={
                                !unlocked ||
                                worldState.coins < cfg.seedCoinCost
                              }
                              onClick={() =>
                                controllerRef.current?.buySeed(crop, 1)
                              }
                              className={`min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                unlocked && worldState.coins >= cfg.seedCoinCost
                                  ? 'bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border border-[#a6cfa0]'
                                  : 'bg-[#e8e0d2] text-[#9e9181] cursor-not-allowed'
                              }`}
                            >
                              {unlocked
                                ? `Buy (+${cfg.seedCoinCost}c)`
                                : 'Locked'}
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>

                {/* Compost & Free Fallback */}
                <div className="pt-2 border-t border-[#e8dfd0] flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      controllerRef.current?.craftCompostFromProduce()
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#ebe0d0] hover:bg-[#dfd0ba] text-[#4d3920] border border-[#bfa684] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Shovel className="w-3.5 h-3.5" />
                    <span>
                      {totalCropProduce >= 2
                        ? 'Compost 2 Produce → +2 Rich Compost'
                        : 'Buy +2 Rich Compost (6 Coins)'}
                    </span>
                  </button>

                  {worldState.canClaimFreeSeeds && (
                    <button
                      type="button"
                      onClick={() =>
                        controllerRef.current?.claimFreeSeedFallback()
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border border-[#a6cfa0] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sprout className="w-3.5 h-3.5" />
                      <span>Claim Free Village Berry Seed Packet</span>
                    </button>
                  )}

                  {/* Quick Inspect Helpers */}
                  <div className="pt-1 flex flex-col gap-1.5">
                    <span className="text-[11px] text-[#7a6b5a]">
                      Quick Inspect on Planet
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          controllerRef.current?.selectFirstEntityOfKind('plot');
                        }}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
                      >
                        Inspect Plot
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          controllerRef.current?.selectFirstEntityOfKind(
                            'building',
                          );
                        }}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
                      >
                        Inspect Mill
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          controllerRef.current?.selectFirstEntityOfKind(
                            'villager',
                          );
                        }}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
                      >
                        Inspect Villager
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {menuTab === 'milestones' && (
              <div className="flex flex-col gap-3.5">
                {/* Current Progression Tier Card */}
                <div className="p-3 rounded-xl bg-[#e6f2e1] border border-[#b5d6ab] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#23451e]">
                      Tier: {worldState.progressionTierLabel}
                    </span>
                    <span className="text-xs font-mono-tabular font-semibold text-[#23451e]">
                      {worldState.gardenPoints} GP
                    </span>
                  </div>
                  {worldState.nextTierLabel && worldState.nextTierPoints ? (
                    <>
                      <p className="text-[11px] text-[#365e30]">
                        Next tier: <strong>{worldState.nextTierLabel}</strong> at{' '}
                        {worldState.nextTierPoints} Garden Points
                      </p>
                      <div className="w-full h-1.5 rounded-full bg-[#cce3c5] overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-[#3f7536] rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (worldState.gardenPoints /
                                  worldState.nextTierPoints) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-[#365e30]">
                      Highest sanctuary tier reached! Auto-replant is unlocked.
                    </p>
                  )}
                </div>

                {/* Tier Unlocks Overview */}
                <div className="grid grid-cols-2 gap-1.5">
                  {PROGRESSION_TIERS.map((tier) => {
                    const unlocked = isTierAtLeast(
                      worldState.progressionTier,
                      tier.id,
                    );
                    return (
                      <div
                        key={tier.id}
                        className={`p-2 rounded-xl border text-[11px] flex flex-col gap-0.5 ${
                          unlocked
                            ? 'bg-[#f2eadb] border-[#d8cbb6] text-[#2b221b]'
                            : 'bg-[#efe9de]/60 border-[#e6dfd3] text-[#8a7c6b]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{tier.title}</span>
                          <span className="font-mono-tabular">
                            {tier.requiredPoints} GP
                          </span>
                        </div>
                        <span className="text-[10px] leading-tight opacity-85">
                          {tier.unlockSummary}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Milestones List */}
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-xs font-semibold text-[#2b221b]">
                    Sanctuary Milestones
                  </span>
                  {MILESTONE_DEFINITIONS.map((m) => {
                    const done = worldState.completedMilestones.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between gap-2"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-[#2b221b] flex items-center gap-1.5">
                            {done && (
                              <Check className="w-3.5 h-3.5 text-[#2e6924] shrink-0" />
                            )}
                            <span>{m.title}</span>
                          </span>
                          <p className="text-[11px] text-[#695b4c]">
                            {m.description}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-mono-tabular font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                            done
                              ? 'bg-[#dff0d8] text-[#23451e]'
                              : 'bg-[#e6dccb] text-[#594d40]'
                          }`}
                        >
                          {done ? 'Claimed' : `+${m.rewardGardenPoints} GP`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {menuTab === 'camera' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-[#695b4c]">
                    Camera Presets
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'orb', label: 'Full Glass Orb' },
                        { id: 'surface', label: 'Meadow Horizon' },
                        { id: 'orbit', label: 'Close Orbit' },
                        { id: 'village', label: 'Village Path' },
                      ] as { id: CameraViewId; label: string }[]
                    ).map((v) => {
                      const active =
                        worldState.activeView === v.id && !worldState.tourActive;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleSelectView(v.id)}
                          className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-xl border cursor-pointer ${transitionClass} ${
                            active
                              ? 'bg-[#dff0d8] text-[#23451e] border-[#a6cfa0] font-semibold'
                              : 'bg-[#f2eadb] border-transparent text-[#594d40] hover:bg-[#e6dccb]'
                          }`}
                        >
                          {v.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e8dfd0] flex flex-col gap-2">
                  <span className="text-xs font-medium text-[#695b4c]">
                    Guided Experience
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleTour}
                    className="w-full min-h-[42px] px-3 py-2.5 text-xs font-semibold rounded-xl bg-[#382f27] text-[#fcf8f0] hover:bg-[#4d4136] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start 30s Scenic Tour</span>
                  </button>
                </div>
              </div>
            )}

            {menuTab === 'settings' && (
              <div className="flex flex-col gap-3.5">
                {/* Planet Name */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="planet-name-input"
                    className="text-xs font-medium text-[#695b4c]"
                  >
                    Terrarium Name
                  </label>
                  <input
                    id="planet-name-input"
                    type="text"
                    value={worldState.planetName}
                    maxLength={28}
                    onChange={(e) =>
                      controllerRef.current?.setPlanetName(e.target.value)
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 text-sm font-medium bg-[#fffdf9] border border-[#cbbba3] rounded-xl text-[#2b221b] focus:outline-none focus:ring-2 focus:ring-[#a6cfa0]"
                  />
                </div>

                {/* Lighting & Time Cycle */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#695b4c]">
                    Lighting Cycle
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        {
                          id: 'auto',
                          label: 'Cycle',
                          icon: <Compass className="w-3.5 h-3.5" />,
                        },
                        {
                          id: 'day',
                          label: 'Day',
                          icon: <Sun className="w-3.5 h-3.5" />,
                        },
                        {
                          id: 'twilight',
                          label: 'Dusk',
                          icon: <Sunset className="w-3.5 h-3.5" />,
                        },
                        {
                          id: 'night',
                          label: 'Night',
                          icon: <Moon className="w-3.5 h-3.5" />,
                        },
                      ] as {
                        id: TimeMode;
                        label: string;
                        icon: React.ReactNode;
                      }[]
                    ).map((m) => {
                      const active = worldState.timeMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectTimeMode(m.id)}
                          className={`min-h-[36px] px-2 py-1 text-xs font-medium rounded-xl border flex items-center justify-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-[#e1ecf7] text-[#264669] border-[#a4c2e3] font-semibold'
                              : 'bg-[#f2eadb] border-transparent text-[#594d40] hover:bg-[#e6dccb]'
                          }`}
                        >
                          {m.icon}
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Weather Controls (Natural Cycle + Scenic Overrides) */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[#e8dfd0]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#695b4c]">
                      Weather ({seasonLabel})
                    </span>
                    {worldState.weatherOverride !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          controllerRef.current?.setWeatherOverride(null)
                        }
                        className="text-[11px] font-semibold text-[#2b5c22] hover:underline cursor-pointer"
                      >
                        Resume Natural Weather
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: null, label: 'Natural' },
                        { id: 'clear', label: 'Clear' },
                        { id: 'rain', label: 'Rain' },
                        { id: 'snow', label: 'Snow' },
                      ] as { id: WeatherPhase | null; label: string }[]
                    ).map((w) => {
                      const active = worldState.weatherOverride === w.id;
                      return (
                        <button
                          key={w.label}
                          type="button"
                          onClick={() =>
                            controllerRef.current?.setWeatherOverride(w.id)
                          }
                          className={`min-h-[34px] px-2 py-1 text-xs font-medium rounded-xl border cursor-pointer ${
                            active
                              ? 'bg-[#dff0d8] text-[#23451e] border-[#a6cfa0] font-semibold'
                              : 'bg-[#f2eadb] border-transparent text-[#594d40] hover:bg-[#e6dccb]'
                          }`}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sound & Ambient Soundscape */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[#e8dfd0]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#4a3f34]">
                      Gentle Sound Effects
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !soundEnabled;
                        setSoundEnabled(next);
                        soundEngine.setEnabled(next);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                        soundEnabled
                          ? 'bg-[#dff0d8] text-[#23451e]'
                          : 'bg-[#efe7d8] text-[#695b4c]'
                      }`}
                    >
                      {soundEnabled ? (
                        <Volume2 className="w-3.5 h-3.5" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5" />
                      )}
                      <span>{soundEnabled ? 'Enabled' : 'Muted'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#4a3f34]">
                      Ambient Weather & Chimes
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !ambientEnabled;
                        setAmbientEnabled(next);
                        soundEngine.setAmbient(next);
                        controllerRef.current?.setAmbientAudioEnabled(next);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-medium cursor-pointer ${
                        ambientEnabled
                          ? 'bg-[#dff0d8] text-[#23451e]'
                          : 'bg-[#efe7d8] text-[#695b4c]'
                      }`}
                    >
                      {ambientEnabled ? 'Playing' : 'Off'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 pt-0.5">
                    <span className="text-xs text-[#695b4c] w-16">Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={soundVolume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSoundVolume(v);
                        soundEngine.setVolume(v);
                        controllerRef.current?.setAmbientAudioVolume(v);
                      }}
                      aria-label="Sound Volume"
                      className="flex-1 accent-[#3f7036]"
                    />
                  </div>
                </div>

                {/* Automation & Accessibility */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[#e8dfd0]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#4a3f34]">
                      Auto-Replant Harvested Beds
                    </span>
                    <button
                      type="button"
                      disabled={!worldState.autoReplantUnlocked}
                      onClick={() =>
                        controllerRef.current?.setAutoReplantEnabled(
                          !worldState.autoReplantEnabled,
                        )
                      }
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-medium cursor-pointer ${
                        !worldState.autoReplantUnlocked
                          ? 'bg-[#e8e0d2] text-[#9e9181] cursor-not-allowed'
                          : worldState.autoReplantEnabled
                            ? 'bg-[#dff0d8] text-[#23451e]'
                            : 'bg-[#efe7d8] text-[#695b4c]'
                      }`}
                    >
                      {!worldState.autoReplantUnlocked
                        ? 'Unlock at 220 GP'
                        : worldState.autoReplantEnabled
                          ? 'Enabled'
                          : 'Off'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#4a3f34]">
                      Reduced Motion
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        controllerRef.current?.setReducedMotion(
                          !worldState.reducedMotion,
                        )
                      }
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-medium cursor-pointer ${
                        worldState.reducedMotion
                          ? 'bg-[#dff0d8] text-[#23451e]'
                          : 'bg-[#efe7d8] text-[#695b4c]'
                      }`}
                    >
                      {worldState.reducedMotion ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                {/* Local Save & Export/Import */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[#e8dfd0]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#695b4c]">
                      Terrarium Save Data
                    </span>
                    {worldState.lastSavedAt && (
                      <span className="text-[10px] text-[#7a6b5a] font-mono-tabular">
                        Saved{' '}
                        {new Date(worldState.lastSavedAt).toLocaleTimeString(
                          [],
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => controllerRef.current?.saveGameManual()}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border border-[#a6cfa0] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const json =
                          controllerRef.current?.exportSaveJson() || '';
                        setSaveJsonBuffer(json);
                        setShowSaveTransfer((prev) => !prev);
                      }}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-[#382f27] text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export / Import</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        controllerRef.current?.resetWorldToDefault()
                      }
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#f7dede] hover:bg-[#f0caca] text-[#692626] text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {showSaveTransfer && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <textarea
                        value={saveJsonBuffer}
                        onChange={(e) => setSaveJsonBuffer(e.target.value)}
                        rows={3}
                        placeholder="Paste exported JSON save data here..."
                        className="w-full p-2 text-[11px] font-mono bg-[#fffdf9] border border-[#cbbba3] rounded-xl text-[#2b221b]"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (saveJsonBuffer.trim()) {
                              controllerRef.current?.importSaveJson(
                                saveJsonBuffer,
                              );
                            }
                          }}
                          className="flex-1 min-h-[34px] px-3 py-1 rounded-xl bg-[#382f27] text-[#fcf8f0] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Load JSON Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSaveTransfer(false)}
                          className="min-h-[34px] px-3 py-1 rounded-xl bg-[#efe7d8] text-[#594d40] text-xs font-medium cursor-pointer"
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. SUBTLE GROUPED HARVEST & STATUS BANNER (Never Separate Pop-Ups)
      ===================================================================== */}
      {(harvestSummaryParts.length > 0 || worldState.statusMessage) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center gap-1.5"
        >
          {harvestSummaryParts.length > 0 && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#2c3b28] text-[#f4faef] border border-[#5b8250] shadow-lg text-xs font-medium whitespace-nowrap">
              <ShoppingBasket className="w-3.5 h-3.5 text-[#b8e986] shrink-0" />
              <span>Gathered {harvestSummaryParts.join(' · ')}</span>
            </div>
          )}
          {worldState.statusMessage && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-[#382f27]/95 text-[#faf5ec] border border-[#6e5f4f] shadow-md text-xs font-medium whitespace-nowrap">
              <span>{worldState.statusMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          5. CONTEXTUAL SELECTION PANEL (Plot, Building, or Villager)
             Shown only when an entity is selected; kept clear of the dock.
      ===================================================================== */}
      {!worldState.tourActive &&
        !menuOpen &&
        expandedCategory === null &&
        worldState.selectedEntity && (
          <aside
            aria-label="Selected item details"
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-md bg-[#faf5ec] text-[#382f27] rounded-2xl border border-[#dfd3bf] shadow-xl p-3.5"
          >
            {/* A. PLOT SELECTED: Compact Crop-Care Panel */}
            {worldState.selectedEntity.kind === 'plot' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-sm font-semibold text-[#2b221b]">
                        {worldState.selectedEntity.lifecycleState ===
                          'prepared' ||
                        worldState.selectedEntity.lifecycleState === 'harvested'
                          ? worldState.selectedEntity.stage
                          : `${worldState.selectedEntity.cropLabel} Bed`}
                      </h2>
                      <span className="text-xs text-[#594d40]">
                        · {worldState.selectedEntity.stage}
                        {worldState.selectedEntity.lifecycleState !==
                          'prepared' &&
                          worldState.selectedEntity.lifecycleState !==
                            'harvested' && (
                            <>
                              {' '}
                              (
                              <span className="font-mono-tabular">
                                {worldState.selectedEntity.growthPct}%
                              </span>
                              )
                            </>
                          )}
                      </span>
                    </div>
                    <p className="text-xs text-[#695b4c] font-mono-tabular mt-0.5">
                      Moisture {worldState.selectedEntity.moisturePct}%
                      {' · '}
                      {worldState.selectedEntity.composted
                        ? 'Enriched Soil (+25% speed, +1 yield)'
                        : 'Standard Soil'}
                      {worldState.selectedEntity.pollinated
                        ? ' · Bee Pollinated'
                        : ''}
                      {worldState.selectedEntity.hasCloche
                        ? ' · Glass Cloche'
                        : ''}
                    </p>
                    {(worldState.selectedEntity.pausedByCold ||
                      worldState.selectedEntity.reservedByVillagerName) && (
                      <p className="text-[11px] text-[#8c5828] mt-0.5">
                        {worldState.selectedEntity.pausedByCold
                          ? 'Winter frost: fit a Glass Cloche to keep growing in snow. '
                          : ''}
                        {worldState.selectedEntity.reservedByVillagerName
                          ? `${worldState.selectedEntity.reservedByVillagerName} is tending this bed.`
                          : ''}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => controllerRef.current?.clearSelection()}
                    aria-label="Deselect plot"
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-[#594d40] hover:bg-[#eae1d3] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Growth Progress Bar */}
                <div className="w-full h-1.5 rounded-full bg-[#e6dccb] overflow-hidden">
                  <div
                    className="h-full bg-[#4f8743] rounded-full transition-all duration-300"
                    style={{
                      width: `${worldState.selectedEntity.growthPct}%`,
                    }}
                  />
                </div>

                {/* If Prepared or Harvested: Show Sow Seed Buttons */}
                {(worldState.selectedEntity.lifecycleState === 'prepared' ||
                  worldState.selectedEntity.lifecycleState === 'harvested') && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['berry', 'wheat', 'pumpkin'] as CropType[]).map(
                      (crop) => {
                        const cfg = CROP_CONFIG[crop];
                        const unlocked = isTierAtLeast(
                          worldState.progressionTier,
                          cfg.unlockTier,
                        );
                        const packetCount = worldState.seedsByCrop[crop];
                        return (
                          <button
                            key={crop}
                            type="button"
                            disabled={!unlocked}
                            onClick={() =>
                              worldState.selectedEntity?.kind === 'plot' &&
                              controllerRef.current?.replantPlot(
                                worldState.selectedEntity.id,
                                crop,
                              )
                            }
                            className={`min-h-[38px] px-2 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                              unlocked
                                ? 'bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border-[#a6cfa0]'
                                : 'bg-[#e8e0d2] border-transparent text-[#9e9181] cursor-not-allowed'
                            }`}
                          >
                            <Sprout className="w-3.5 h-3.5 shrink-0" />
                            <span className="capitalize">
                              Sow {crop} ({packetCount})
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}

                {/* Crop-Care Actions */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.waterPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#d9eef7] hover:bg-[#c6e4f2] text-[#1b4c66] border border-[#91c4de] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Droplets className="w-3.5 h-3.5 shrink-0" />
                    <span>Water</span>
                  </button>

                  <button
                    type="button"
                    disabled={worldState.selectedEntity.composted}
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.compostPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      worldState.selectedEntity.composted
                        ? 'bg-[#e8e0d2] border-transparent text-[#9e9181] cursor-not-allowed'
                        : 'bg-[#ebe0d0] hover:bg-[#dfd0ba] text-[#4d3920] border-[#bfa684] cursor-pointer'
                    }`}
                  >
                    <Shovel className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {worldState.selectedEntity.composted
                        ? 'Enriched'
                        : 'Compost'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      worldState.selectedEntity.lifecycleState !== 'ripe'
                    }
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.harvestPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      worldState.selectedEntity.lifecycleState === 'ripe'
                        ? 'bg-[#f7e8c8] hover:bg-[#f0dcaf] text-[#5c400e] border-[#dbb872] cursor-pointer'
                        : 'bg-[#e8e0d2] border-transparent text-[#9e9181] cursor-not-allowed'
                    }`}
                  >
                    <ShoppingBasket className="w-3.5 h-3.5 shrink-0" />
                    <span>Harvest</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      worldState.selectedEntity.hasCloche ||
                      !isTierAtLeast(
                        worldState.progressionTier,
                        'flourishing_terrarium',
                      )
                    }
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.installClocheOnPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap ${
                      worldState.selectedEntity.hasCloche ||
                      !isTierAtLeast(
                        worldState.progressionTier,
                        'flourishing_terrarium',
                      )
                        ? 'bg-[#e8e0d2] border-transparent text-[#9e9181] cursor-not-allowed'
                        : 'bg-[#e0f2f1] hover:bg-[#cce8e6] text-[#195752] border-[#99d1cc] cursor-pointer'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {worldState.selectedEntity.hasCloche
                        ? 'Cloche On'
                        : 'Cloche'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* B. BUILDING SELECTED: Relevant Building Actions */}
            {worldState.selectedEntity.kind === 'building' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#2b221b]">
                        {worldState.selectedEntity.title}
                      </h2>
                      <span className="text-xs text-[#2e5926] font-medium">
                        · {worldState.selectedEntity.harmonyBonus}
                      </span>
                    </div>
                    <p className="text-xs text-[#695b4c] mt-0.5">
                      {worldState.selectedEntity.subtitle}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => controllerRef.current?.clearSelection()}
                    aria-label="Deselect building"
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-[#594d40] hover:bg-[#eae1d3] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {typeof worldState.selectedEntity.productionProgress ===
                  'number' && (
                  <div className="w-full h-1.5 rounded-full bg-[#e6dccb] overflow-hidden">
                    <div
                      className="h-full bg-[#c78826] rounded-full transition-all duration-300"
                      style={{
                        width: `${worldState.selectedEntity.productionProgress}%`,
                      }}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!worldState.selectedEntity.canPerformAction}
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'building' &&
                      controllerRef.current?.performBuildingAction(
                        worldState.selectedEntity.id,
                      )
                    }
                    className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      worldState.selectedEntity.canPerformAction
                        ? 'bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border-[#a6cfa0] cursor-pointer'
                        : 'bg-[#e8e0d2] border-transparent text-[#8c7f70] cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>{worldState.selectedEntity.actionLabel}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectView('village')}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-[#382f27] text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    Close View
                  </button>

                  {worldState.selectedEntity.removable && (
                    <button
                      type="button"
                      onClick={() =>
                        worldState.selectedEntity?.kind === 'building' &&
                        controllerRef.current?.removeEntityById(
                          worldState.selectedEntity.id,
                        )
                      }
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-[#f7dede] hover:bg-[#f0caca] text-[#692626] text-xs font-medium cursor-pointer whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* C. VILLAGER SELECTED: Role & Assignment Controls */}
            {worldState.selectedEntity.kind === 'villager' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#2b221b]">
                        {worldState.selectedEntity.name}
                      </h2>
                      <span className="text-xs text-[#594d40]">
                        · {worldState.selectedEntity.role}
                      </span>
                    </div>
                    <p className="text-xs text-[#2e5926] font-medium mt-0.5">
                      {worldState.selectedEntity.activity}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => controllerRef.current?.clearSelection()}
                    aria-label="Deselect villager"
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-[#594d40] hover:bg-[#eae1d3] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Role Selection */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#695b4c]">
                    Role
                  </span>
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {VILLAGER_ROLE_OPTIONS.map((role) => {
                      const active =
                        worldState.selectedEntity?.kind === 'villager' &&
                        worldState.selectedEntity.role === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            worldState.selectedEntity?.kind === 'villager' &&
                            controllerRef.current?.updateVillagerRole(
                              worldState.selectedEntity.id,
                              role,
                            )
                          }
                          className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-[#382f27] text-[#fcf8f0] font-semibold'
                              : 'bg-[#f0e8da] text-[#594d40] hover:bg-[#e4dac8]'
                          }`}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assignment Selection */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#695b4c]">
                    Assignment
                  </span>
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {VILLAGER_ASSIGNMENT_OPTIONS.map((assign) => {
                      const active =
                        worldState.selectedEntity?.kind === 'villager' &&
                        worldState.selectedEntity.assignment === assign;
                      return (
                        <button
                          key={assign}
                          type="button"
                          onClick={() =>
                            worldState.selectedEntity?.kind === 'villager' &&
                            controllerRef.current?.updateVillagerAssignment(
                              worldState.selectedEntity.id,
                              assign,
                            )
                          }
                          className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-[#dff0d8] text-[#23451e] border border-[#a6cfa0] font-semibold'
                              : 'bg-[#f0e8da] text-[#594d40] hover:bg-[#e4dac8]'
                          }`}
                        >
                          {assign}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

      {/* =====================================================================
          6. ONE COHESIVE, EXPANDABLE BOTTOM DOCK (Plant, Tend, Harvest, Build)
      ===================================================================== */}
      {!worldState.tourActive && (
        <nav
          aria-label="Primary world actions dock"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none flex flex-col items-center gap-2"
        >
          {/* A. Attached Expandable Tool Tray (Only 1 category open at a time) */}
          {expandedCategory !== null && (
            <div
              role="region"
              aria-label={`${expandedCategory} tools tray`}
              className={`pointer-events-auto w-full bg-[#faf5ec] text-[#382f27] rounded-2xl border border-[#dfd3bf] shadow-xl p-2.5 flex flex-col gap-2 ${transitionClass}`}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-[#2b221b] capitalize">
                  {expandedCategory} Tools
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedCategory(null)}
                  aria-label="Collapse tool tray"
                  className="min-h-[32px] px-2 py-0.5 rounded-lg text-xs text-[#695b4c] hover:bg-[#eae1d3] flex items-center gap-1 cursor-pointer"
                >
                  <span>Close</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {trayTools.map((tool) => {
                  const isSelected = worldState.activeTool === tool.id;
                  const unlocked = isTierAtLeast(
                    worldState.progressionTier,
                    tool.requiredTier,
                  );
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleSelectTool(tool.id)}
                      title={
                        unlocked
                          ? tool.description
                          : `Unlocks at ${getTierTitle(tool.requiredTier)}`
                      }
                      className={`min-h-[48px] px-3 py-2 rounded-xl border flex items-center gap-2 shrink-0 cursor-pointer ${transitionClass} ${
                        !unlocked
                          ? 'bg-[#efe9de] border-[#e2d9c8] text-[#8c7f70] opacity-80'
                          : isSelected
                            ? `${tool.accentBg} ${tool.accentBorder} ${tool.accentText} font-semibold shadow-xs`
                            : 'bg-[#f2eadb] border-[#e2d6c3] text-[#4a3f34] hover:bg-[#e8decb] hover:text-[#2b221b]'
                      }`}
                    >
                      {unlocked ? (
                        renderToolIcon(tool.id)
                      ) : (
                        <Lock className="w-3.5 h-3.5 shrink-0 text-[#8c7f70]" />
                      )}
                      <div className="flex flex-col items-start text-left">
                        <span className="text-xs font-medium leading-tight whitespace-nowrap">
                          {tool.shortLabel}
                        </span>
                        <span className="text-[10px] opacity-75 leading-tight whitespace-nowrap font-mono-tabular">
                          {unlocked
                            ? getToolSubLabel(tool.id, tool.instantAction)
                            : getTierTitle(tool.requiredTier)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* B. Active Placement Mode Banner (Clear indicator + obvious Exit button) */}
          {activeToolDef && expandedCategory === null && (
            <div
              role="status"
              className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-[#faf5ec] text-[#2b221b] border border-[#d6c7b0] shadow-lg w-auto max-w-full"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${activeToolDef.accentBg} ${activeToolDef.accentBorder} ${activeToolDef.accentText}`}
                >
                  {renderToolIcon(activeToolDef.id)}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {activeToolDef.label} Active
                  </div>
                  <div className="text-[11px] text-[#695b4c] truncate">
                    {activeToolDef.description}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExitToolMode}
                aria-label="Exit placement mode"
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#382f27] text-[#fcf8f0] hover:bg-[#4d4136] text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
          )}

          {/* C. Primary 4-Category Dock Bar: Plant, Tend, Harvest, Build */}
          <div
            role="toolbar"
            aria-label="Primary categories"
            className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#faf5ec] text-[#382f27] border border-[#dfd3bf] shadow-xl"
          >
            {DOCK_CATEGORIES.map((cat) => {
              const isExpanded = expandedCategory === cat.id;
              const hasActiveTool =
                activeCategoryForHighlight === cat.id && !isExpanded;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleToggleCategory(cat.id)}
                  aria-expanded={isExpanded}
                  className={`min-h-[46px] px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${transitionClass} ${
                    isExpanded
                      ? 'bg-[#382f27] text-[#fcf8f0] shadow-xs'
                      : hasActiveTool
                        ? 'bg-[#dff0d8] text-[#23451e] border border-[#a6cfa0]'
                        : 'bg-transparent text-[#4a3f34] hover:bg-[#efe6d8] hover:text-[#2b221b]'
                  }`}
                >
                  {renderCategoryIcon(cat.id)}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Scenic Tour Stop Control */}
      {worldState.tourActive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button
            type="button"
            onClick={handleToggleTour}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#faf5ec] text-[#2b221b] border border-[#dfd3bf] shadow-xl text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Exit Scenic Tour</span>
          </button>
        </div>
      )}
    </div>
  );
}
