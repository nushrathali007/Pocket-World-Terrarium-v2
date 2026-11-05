import {
  CropType,
  SeasonId,
  TimeMode,
  VillagerAssignment,
  VillagerRole,
  WeatherPhase,
} from '../types/world';
import { PlacedObjectType } from '../three/MiniatureObjects';

export const SAVE_VERSION = 2;
export const SAVE_STORAGE_KEY = 'pocket_world_terrarium_save_v2';

export interface SerializedPlacedObjectV2 {
  id: string;
  type: PlacedObjectType;
  dir: [number, number, number];
  yaw: number;
  growth: number;
  targetGrowth: number;
  removable: boolean;
  cropType?: CropType;
  hasCrop?: boolean;
  harvested?: boolean;
  moisture?: number;
  composted?: boolean;
  hasCloche?: boolean;
  isProcessing?: boolean;
  productionTimer?: number;
  storedOutput?: number;
  customTitle?: string;
}

export interface SerializedVillagerV2 {
  id: string;
  name: string;
  role: VillagerRole;
  assignment: VillagerAssignment;
  dir: [number, number, number];
  yaw: number;
}

export interface SerializedSheepV2 {
  id: string;
  dir: [number, number, number];
  yaw: number;
  inPasture: boolean;
}

export interface SerializedWorldSaveV2 {
  version: number;
  savedAt: number;
  planetName: string;
  dayCount: number;
  timeMode: TimeMode;
  timeOfDay: number;
  season: SeasonId;
  seasonTimer: number;
  weatherPhase: WeatherPhase;
  weatherTimer: number;
  weatherOverride: WeatherPhase | null;
  reducedMotion: boolean;
  autoReplantEnabled: boolean;
  coins: number;
  gardenPoints: number;
  seedsByCrop: Record<CropType, number>;
  resources: {
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
  completedMilestones: string[];
  discoveredCrops: CropType[];
  terrainRadii: number[];
  tilledFacets: boolean[];
  placedObjects: SerializedPlacedObjectV2[];
  villagers: SerializedVillagerV2[];
  sheep: SerializedSheepV2[];
}

function isFiniteVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    Number.isFinite(v[0]) &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[1]) &&
    typeof v[2] === 'number' &&
    Number.isFinite(v[2])
  );
}

export function validateWorldSave(data: unknown): SerializedWorldSaveV2 | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Partial<SerializedWorldSaveV2>;

  if (raw.version !== SAVE_VERSION) return null;
  if (typeof raw.coins !== 'number' || !Number.isFinite(raw.coins)) return null;
  if (typeof raw.gardenPoints !== 'number' || !Number.isFinite(raw.gardenPoints))
    return null;
  if (!Array.isArray(raw.terrainRadii) || !Array.isArray(raw.placedObjects))
    return null;
  if (!raw.resources || typeof raw.resources.water !== 'number') return null;
  if (!raw.inventory || typeof raw.inventory.wheat !== 'number') return null;
  if (
    !raw.seedsByCrop ||
    typeof raw.seedsByCrop.wheat !== 'number' ||
    typeof raw.seedsByCrop.pumpkin !== 'number' ||
    typeof raw.seedsByCrop.berry !== 'number'
  ) {
    return null;
  }

  for (const obj of raw.placedObjects) {
    if (!obj || typeof obj.id !== 'string' || typeof obj.type !== 'string') {
      return null;
    }
    if (!isFiniteVec3(obj.dir)) return null;
  }

  if (Array.isArray(raw.villagers)) {
    for (const v of raw.villagers) {
      if (!v || typeof v.id !== 'string' || !isFiniteVec3(v.dir)) return null;
    }
  }

  return raw as SerializedWorldSaveV2;
}

export function saveWorldToStorage(save: SerializedWorldSaveV2): boolean {
  try {
    const json = JSON.stringify(save);
    window.localStorage.setItem(SAVE_STORAGE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function loadWorldFromStorage(): SerializedWorldSaveV2 | null {
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateWorldSave(parsed);
  } catch {
    return null;
  }
}

export function clearWorldStorage(): void {
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
