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
  Compass,
  Droplets,
  Eraser,
  Fan,
  Flame,
  Flower2,
  Hammer,
  Home,
  LampFloor,
  Leaf,
  Menu,
  Moon,
  Package,
  Play,
  Sailboat,
  Shovel,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Sunset,
  TowerControl,
  Trees,
  Users,
  Volume2,
  VolumeX,
  Wheat,
  Wind,
  X,
} from 'lucide-react';
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
    case 'wheat_seed':
      return <Wheat className={cls} />;
    case 'pumpkin_seed':
      return < Leaf className={cls} />;
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
    tourActive: false,
    tourElapsed: 0,
    tourPhase: '',
    reducedMotion: false,
    selectedEntity: null,
    resources: {
      seeds: 14,
      water: 18,
      compost: 8,
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
      ripePlots: 3,
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

  // Milestones computed from live worldState
  const milestones = [
    {
      id: 'gardener',
      title: 'Meadow Gardener',
      desc: 'Cultivate and tend garden plots across the terrarium',
      current: worldState.stats.totalPlanted + worldState.stats.totalTended,
      target: 12,
    },
    {
      id: 'harvest',
      title: 'Bountiful Basket',
      desc: 'Gather ripe wheat, pumpkins, berries, and honey',
      current: worldState.stats.totalHarvested,
      target: 12,
    },
    {
      id: 'pollinator',
      title: 'Pollinator Sanctuary',
      desc: 'Maintain meadow wildflowers and painted beehives',
      current: worldState.objectCounts.flowers,
      target: 8,
    },
    {
      id: 'hamlet',
      title: 'Peaceful Sanctuary',
      desc: 'Reach 14 villagers living in harmony',
      current: worldState.population,
      target: 14,
    },
  ];

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
          2. TOP COMPACT STATUS STRIP (Time, Weather, Resources & Menu Home)
      ===================================================================== */}
      {!worldState.tourActive && (
        <header
          aria-label="Terrarium status strip"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[96vw]"
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 px-3 py-1.5 rounded-2xl bg-[#faf5ec] text-[#382f27] border border-[#e0d4c0] shadow-lg">
            {/* Planet Name */}
            <span className="font-display text-sm font-semibold text-[#2b221b] whitespace-nowrap px-1">
              {worldState.planetName}
            </span>

            <span className="text-[#cbbba3]" aria-hidden="true">
              ·
            </span>

            {/* Time of Day (Click to gently cycle time preset) */}
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
              <span className="font-mono-tabular">Day {worldState.dayCount}</span>
              <span className="hidden sm:inline text-[#7a6b5a]">
                · {timePhaseLabel}
              </span>
            </button>

            {/* Weather (Click to gently cycle weather) */}
            <button
              type="button"
              onClick={() => controllerRef.current?.cycleWeather()}
              title="Click to change weather"
              className="min-h-[36px] px-2 py-1 rounded-xl hidden md:flex items-center gap-1.5 text-xs font-medium text-[#4a3f34] hover:bg-[#efe6d8] cursor-pointer whitespace-nowrap"
            >
              {worldState.weatherSummary === 'Gentle Rain' ? (
                <CloudRain className="w-3.5 h-3.5 text-[#386fa4] shrink-0" />
              ) : worldState.weatherSummary === 'Soft Snow' ? (
                <CloudSnow className="w-3.5 h-3.5 text-[#4a7c9b] shrink-0" />
              ) : (
                <Wind className="w-3.5 h-3.5 text-[#4d7c43] shrink-0" />
              )}
              <span>{worldState.weatherSummary}</span>
            </button>

            <span className="text-[#cbbba3]" aria-hidden="true">
              ·
            </span>

            {/* Compact Resources (Seeds, Water, Compost, Harvest) */}
            <div
              className="flex items-center gap-2.5 sm:gap-3 px-1 text-xs font-mono-tabular text-[#4a3f34] whitespace-nowrap"
              aria-label="Available resources"
            >
              <span
                className="flex items-center gap-1"
                title="Seeds available for planting"
              >
                <Sprout className="w-3.5 h-3.5 text-[#3f7036] shrink-0" />
                <span className="hidden lg:inline text-[#6e5f4f]">Seeds</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.seeds}
                </strong>
              </span>

              <span
                className="flex items-center gap-1"
                title="Water reserves for tending"
              >
                <Droplets className="w-3.5 h-3.5 text-[#2d6fa3] shrink-0" />
                <span className="hidden lg:inline text-[#6e5f4f]">Water</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.water}
                </strong>
              </span>

              <span
                className="hidden sm:flex items-center gap-1"
                title="Rich compost for enriching soil"
              >
                <Shovel className="w-3.5 h-3.5 text-[#7a542e] shrink-0" />
                <span className="hidden lg:inline text-[#6e5f4f]">Compost</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.compost}
                </strong>
              </span>

              <span
                className="flex items-center gap-1"
                title="Total harvested crops in basket"
              >
                <ShoppingBasket className="w-3.5 h-3.5 text-[#9c631e] shrink-0" />
                <span className="hidden lg:inline text-[#6e5f4f]">Harvest</span>
                <strong className="font-semibold text-[#2b221b]">
                  {worldState.resources.harvestTotal}
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
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-md bg-[#faf5ec] text-[#382f27] rounded-2xl border border-[#dfd3bf] shadow-2xl overflow-hidden"
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
                    label: 'Inventory',
                    icon: <Package className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'milestones',
                    label: 'Milestones',
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
          <div className="p-4 max-h-[68vh] overflow-y-auto">
            {menuTab === 'inventory' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-xs text-[#695b4c]">
                  <span>Gathered Pantry & Goods</span>
                  <span className="font-mono-tabular">
                    {worldState.objectCounts.plots} Plots ·{' '}
                    {worldState.objectCounts.ripePlots} Ripe
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Golden Wheat</span>
                    <strong className="text-sm font-semibold text-[#2b221b]">
                      {worldState.inventory.wheat}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Pumpkins</span>
                    <strong className="text-sm font-semibold text-[#2b221b]">
                      {worldState.inventory.pumpkin}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Sweet Berries</span>
                    <strong className="text-sm font-semibold text-[#2b221b]">
                      {worldState.inventory.berry}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Meadow Honey</span>
                    <strong className="text-sm font-semibold text-[#2b221b]">
                      {worldState.inventory.honey}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Mill Flour</span>
                    <strong className="text-sm font-semibold text-[#2b221b]">
                      {worldState.inventory.flour}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#f2eadb] flex items-center justify-between">
                    <span className="font-sans text-[#4a3f34]">Harmony</span>
                    <strong className="text-sm font-semibold text-[#2e5926]">
                      {worldState.happiness}%
                    </strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e8dfd0] flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      controllerRef.current?.craftSeedsAndCompost()
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#dff0d8] hover:bg-[#d0e8c6] text-[#23451e] border border-[#a6cfa0] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sprout className="w-4 h-4" />
                    <span>Prepare +4 Seeds, +3 Compost & +4 Water</span>
                  </button>

                  {/* Quick Inspect Helpers */}
                  <div className="pt-1 flex flex-col gap-1.5">
                    <span className="text-[11px] text-[#7a6b5a]">
                      Quick Inspect on Planet (or click any object directly)
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          controllerRef.current?.selectFirstEntityOfKind('plot');
                        }}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
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
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
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
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-xs font-medium text-[#382f27] cursor-pointer whitespace-nowrap"
                      >
                        Inspect Villager
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {menuTab === 'milestones' && (
              <div className="flex flex-col gap-3">
                {milestones.map((m) => {
                  const done = m.current >= m.target;
                  const pct = Math.min(
                    100,
                    Math.round((m.current / m.target) * 100),
                  );
                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-[#f2eadb] flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#2b221b] flex items-center gap-1.5">
                          {done && (
                            <Check className="w-3.5 h-3.5 text-[#2e6924] shrink-0" />
                          )}
                          <span>{m.title}</span>
                        </span>
                        <span className="text-xs font-mono-tabular text-[#594d40]">
                          {Math.min(m.current, m.target)} / {m.target}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#695b4c]">{m.desc}</p>
                      <div className="w-full h-1.5 rounded-full bg-[#dfd3bf] overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-[#4f8743] rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
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
              <div className="flex flex-col gap-4">
                {/* Planet Name */}
                <div className="flex flex-col gap-1.5">
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
                      setWorldState((prev) => ({
                        ...prev,
                        planetName: e.target.value,
                      }))
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm font-medium bg-[#fffdf9] border border-[#cbbba3] rounded-xl text-[#2b221b] focus:outline-none focus:ring-2 focus:ring-[#a6cfa0]"
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
                          className={`min-h-[38px] px-2 py-1.5 text-xs font-medium rounded-xl border flex items-center justify-center gap-1 cursor-pointer ${
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

                {/* Sound & Chimes */}
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
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
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
                      Ambient Wind Chimes
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !ambientEnabled;
                        setAmbientEnabled(next);
                        soundEngine.setAmbient(next);
                      }}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium cursor-pointer ${
                        ambientEnabled
                          ? 'bg-[#dff0d8] text-[#23451e]'
                          : 'bg-[#efe7d8] text-[#695b4c]'
                      }`}
                    >
                      {ambientEnabled ? 'Playing' : 'Off'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
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
                      }}
                      aria-label="Sound Volume"
                      className="flex-1 accent-[#3f7036]"
                    />
                  </div>
                </div>

                {/* Reduced Motion */}
                <div className="flex items-center justify-between pt-2 border-t border-[#e8dfd0]">
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
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium cursor-pointer ${
                      worldState.reducedMotion
                        ? 'bg-[#dff0d8] text-[#23451e]'
                        : 'bg-[#efe7d8] text-[#695b4c]'
                    }`}
                  >
                    {worldState.reducedMotion ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. SUBTLE GROUPED HARVEST MESSAGE (Never Separate Pop-Ups)
      ===================================================================== */}
      {harvestSummaryParts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#2c3b28] text-[#f4faef] border border-[#5b8250] shadow-lg text-xs font-medium whitespace-nowrap">
            <ShoppingBasket className="w-3.5 h-3.5 text-[#b8e986] shrink-0" />
            <span>Gathered {harvestSummaryParts.join(' · ')}</span>
          </div>
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
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#2b221b]">
                        {worldState.selectedEntity.cropLabel} Plot
                      </h2>
                      <span className="text-xs text-[#594d40]">
                        · {worldState.selectedEntity.stage} (
                        <span className="font-mono-tabular">
                          {worldState.selectedEntity.growthPct}%
                        </span>
                        )
                      </span>
                    </div>
                    <p className="text-xs text-[#695b4c] font-mono-tabular mt-0.5">
                      Moisture {worldState.selectedEntity.moisturePct}%
                      {' · '}
                      {worldState.selectedEntity.composted
                        ? 'Enriched Compost (2x Yield)'
                        : 'Standard Soil'}
                      {worldState.selectedEntity.pollinated
                        ? ' · Bee Pollinated'
                        : ''}
                    </p>
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
                    className="min-h-[42px] px-2.5 py-1.5 rounded-xl bg-[#d9eef7] hover:bg-[#c6e4f2] text-[#1b4c66] border border-[#91c4de] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Droplets className="w-3.5 h-3.5 shrink-0" />
                    <span>Water</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.compostPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className="min-h-[42px] px-2.5 py-1.5 rounded-xl bg-[#ebe0d0] hover:bg-[#dfd0ba] text-[#4d3920] border border-[#bfa684] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Shovel className="w-3.5 h-3.5 shrink-0" />
                    <span>Compost</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'plot' &&
                      controllerRef.current?.harvestPlot(
                        worldState.selectedEntity.id,
                      )
                    }
                    className="min-h-[42px] px-2.5 py-1.5 rounded-xl bg-[#f7e8c8] hover:bg-[#f0dcaf] text-[#5c400e] border border-[#dbb872] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <ShoppingBasket className="w-3.5 h-3.5 shrink-0" />
                    <span>Harvest</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (worldState.selectedEntity?.kind !== 'plot') return;
                      const order: CropType[] = ['wheat', 'pumpkin', 'berry'];
                      const nextCrop =
                        order[
                          (order.indexOf(worldState.selectedEntity.cropType) +
                            1) %
                            order.length
                        ];
                      controllerRef.current?.replantPlot(
                        worldState.selectedEntity.id,
                        nextCrop,
                      );
                    }}
                    className="min-h-[42px] px-2.5 py-1.5 rounded-xl bg-[#f0e8da] hover:bg-[#e4dac8] text-[#4a3f34] border border-[#dcd0bc] text-xs font-medium flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Sprout className="w-3.5 h-3.5 shrink-0" />
                    <span>Replant</span>
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      worldState.selectedEntity?.kind === 'building' &&
                      controllerRef.current?.performBuildingAction(
                        worldState.selectedEntity.id,
                      )
                    }
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#dff0d8] hover:bg-[#cfe7c5] text-[#23451e] border border-[#a6cfa0] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                    <p className="text-xs text-[#695b4c] mt-0.5">
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
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleSelectTool(tool.id)}
                      title={tool.description}
                      className={`min-h-[48px] px-3 py-2 rounded-xl border flex items-center gap-2 shrink-0 cursor-pointer ${transitionClass} ${
                        isSelected
                          ? `${tool.accentBg} ${tool.accentBorder} ${tool.accentText} font-semibold shadow-xs`
                          : 'bg-[#f2eadb] border-[#e2d6c3] text-[#4a3f34] hover:bg-[#e8decb] hover:text-[#2b221b]'
                      }`}
                    >
                      {renderToolIcon(tool.id)}
                      <div className="flex flex-col items-start text-left">
                        <span className="text-xs font-medium leading-tight whitespace-nowrap">
                          {tool.shortLabel}
                        </span>
                        <span className="text-[10px] opacity-75 leading-tight whitespace-nowrap">
                          {tool.instantAction ? 'Instant' : 'Select'}
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
                    Click planet surface to apply
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
