import * as THREE from 'three';
import {
  BUILDING_COSTS,
  computePlotLifecycleState,
  CROP_CONFIGS,
  isPlotRipe,
  MILESTONE_DEFINITIONS,
  PlotLifecycleState,
  PRODUCTION_CONFIG,
  PROGRESSION_TIERS,
  ProgressionTierId,
  SEASON_DURATION_SEC,
  SeasonId,
  SEASONS_ORDER,
  WEATHER_PHASE_DURATIONS,
  WeatherPhase,
} from '../config/farmConfig';
import {
  CameraViewId,
  CropType,
  HarvestFeedbackBatch,
  SelectedEntityInfo,
  TimeMode,
  TOOL_DEFINITIONS,
  ToolId,
  VillagerAssignment,
  VillagerRole,
  WeatherMode,
  WeatherSummary,
  WorldState,
} from '../types/world';
import { AmbientSoundscape } from '../utils/ambientAudio';
import {
  clearWorldStorage,
  loadWorldFromStorage,
  SAVE_VERSION,
  saveWorldToStorage,
  SerializedWorldSaveV2,
  validateWorldSave,
} from '../utils/saveSystem';
import { soundEngine } from '../utils/sound';
import { createRoomEnvTexture } from '../utils/textures';
import { QuietPixelEffectsCoordinator } from './QuietPixelEffects';
import {
  BalloonEntity,
  CloudEntity,
  createBeehiveMesh,
  createCampfireMesh,
  createFlowerClusterMesh,
  createGardenPlotMesh,
  createHotAirBalloonMesh,
  createLanternPostMesh,
  createOakTreeMesh,
  createPalmTreeMesh,
  createPastelHouseMesh,
  createPineTreeMesh,
  createPuffyCloudMesh,
  createRainbowArchMesh,
  createSailboatMesh,
  createSheepMesh,
  createShootingStarMesh,
  createSteppingPathMesh,
  createStoneWatchtowerMesh,
  createStoneWellMesh,
  createStripedLighthouseMesh,
  createSwanDuckFlockMesh,
  createVillagerMesh,
  createWhiteWindmillMesh,
  createWoodenDockMesh,
  createWoodenFenceMesh,
  DuckEntity,
  GardenPlotParts,
  PlacedObjectEntity,
  PlacedObjectType,
  SailboatEntity,
  SheepEntity,
  ShootingStarEntity,
  VillagerEntity,
} from './MiniatureObjects';
import { createPlanetTerrain } from './PlanetTerrain';
import { createRoomEnvironment } from './RoomEnvironment';

const UP_VEC = new THREE.Vector3(0, 1, 0);

const VILLAGER_NAMES = [
  'Clara',
  'Milo',
  'Rowan',
  'Hazel',
  'Finn',
  'Pippa',
  'Oliver',
  'Nora',
  'Arthur',
  'Maeve',
  'Leo',
  'Iris',
  'Bram',
  'Wren',
  'Soren',
  'Fern',
];

const VILLAGER_ROLES: VillagerRole[] = [
  'Gardener',
  'Miller',
  'Beekeeper',
  'Builder',
  'Forager',
];

const VILLAGER_ASSIGNMENTS: VillagerAssignment[] = [
  'Meadow Plots',
  'Windmill & Granary',
  'Apiary & Orchards',
  'Village Commons',
  'Coastal Pier',
];

interface SparkleBurst {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  age: number;
  maxAge: number;
}

const IS_SOFTWARE_GL = (() => {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = (probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      probeCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

export class PocketWorldController {
  private container: HTMLElement;
  private onStateChange: (updater: (prev: WorldState) => WorldState) => void;
  private onHarvestFeedback?: (batch: Partial<HarvestFeedbackBatch>) => void;

  private renderer: THREE.WebGLRenderer | null = null;
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private isSoftwareGl = IS_SOFTWARE_GL;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animFrameId: number | null = null;
  private timerFrameId: number | null = null;
  private clock = new THREE.Clock();

  private roomEnv!: ReturnType<typeof createRoomEnvironment>;
  private planetRoot!: THREE.Group;
  private terrain!: ReturnType<typeof createPlanetTerrain>;
  private objectsGroup!: THREE.Group;
  private inhabitantsGroup!: THREE.Group;
  private atmosphereGroup!: THREE.Group;
  private effectsGroup!: THREE.Group;

  // Celestial bodies & lighting
  private roomWindowLight!: THREE.DirectionalLight;
  private roomAmbientLight!: THREE.AmbientLight;
  private roomHemiLight!: THREE.HemisphereLight;
  private sunGroup!: THREE.Group;
  private sunLight!: THREE.DirectionalLight;
  private moonGroup!: THREE.Group;
  private moonLight!: THREE.DirectionalLight;
  private firefliesPoints!: THREE.Points;
  private firefliesMat!: THREE.PointsMaterial;
  private firefliesBasePositions: THREE.Vector3[] = [];

  // Entities
  private placedObjects: PlacedObjectEntity[] = [];
  private villagers: VillagerEntity[] = [];
  private sheepList: SheepEntity[] = [];
  private clouds: CloudEntity[] = [];
  private sailboats: SailboatEntity[] = [];
  private ducks: DuckEntity[] = [];
  private balloons: BalloonEntity[] = [];
  private shootingStars: ShootingStarEntity[] = [];
  private sparkles: SparkleBurst[] = [];

  private wellDirection = new THREE.Vector3(-0.16, 0.22, 0.96).normalize();
  private pastureCenter = new THREE.Vector3(-0.20, -0.15, 0.97).normalize();
  private pastureRadius = 0.098;
  private houseCounter = 0;
  private villagerCounter = 0;
  private boatCounter = 0;
  private balloonCounter = 0;
  private shootingStarGazeTimer = 0;

  // Hover indicator & Selection ring on spherical surface
  private cursorRing!: THREE.Mesh;
  private selectionRing!: THREE.Mesh;
  private selectedEntityId: string | null = null;
  private lastSelectionSyncTime = 0;

  // Resources, Inventory, Economy, Progression & Activity Counters
  private planetName = 'Little Meadow';
  private coins = 32;
  private gardenPoints = 6;
  private seedsByCrop: Record<CropType, number> = {
    berry: 5,
    wheat: 5,
    pumpkin: 2,
  };
  private discoveredCrops = new Set<CropType>(['berry', 'wheat']);
  private completedMilestones = new Set<string>();
  private autoReplantEnabled = false;
  private statusMessage: string | null = null;
  private statusMessageTimer: number | null = null;
  private lastSavedAt: number | null = null;
  private autosaveTimer = 24;
  private isTabHidden = false;

  // Shared Weather & Season Controller
  private season: SeasonId = 'spring';
  private seasonTimer = 0;
  private weatherPhase: WeatherPhase = 'clear';
  private weatherTimer = WEATHER_PHASE_DURATIONS.clear;
  private weatherOverride: WeatherPhase | null = null;

  // PixelFX Coordinator & Procedural Ambient Soundscape
  private pixelFx!: QuietPixelEffectsCoordinator;
  private ambientAudio = new AmbientSoundscape();

  private resources = {
    seeds: 12,
    water: 18,
    compost: 4,
    harvestTotal: 6,
  };
  private inventory = {
    wheat: 2,
    pumpkin: 1,
    berry: 2,
    honey: 1,
    flour: 1,
  };
  private stats = {
    totalPlanted: 6,
    totalHarvested: 6,
    totalTended: 4,
  };

  // Interaction & Inertia state
  private activeTool: ToolId | null = null;
  private activeView: CameraViewId = 'orb';
  private timeMode: TimeMode = 'auto';
  private timeOfDay = 0.24; // Starts in warm sunlit afternoon
  private dayCount = 1;
  private reducedMotion = false;

  private isPointerDown = false;
  private isDraggingSpin = false;
  private pointerDownPos = new THREE.Vector2();
  private lastPointerPos = new THREE.Vector2();
  private angularVelocity = new THREE.Vector2(0.0, 0.0);

  // Disabled forced 3-second intro spin by default so camera starts still and ready for play
  private introSpinActive = false;
  private introSpinElapsed = 0;

  // Camera choreography
  private camCurrentPos = new THREE.Vector3(-1.12, 0.78, 4.35);
  private camCurrentLook = new THREE.Vector3(0.08, -0.22, 0.0);
  private camTargetPos = new THREE.Vector3(-1.12, 0.78, 4.35);
  private camTargetLook = new THREE.Vector3(0.08, -0.22, 0.0);

  // 30-Second Choreographed Demo Tour state
  private tourActive = false;
  private tourElapsed = 0;
  private tourStartTimeMs = 0;
  private lastReportedTourRemaining = -1;
  private tourStepTriggered = new Set<number>();
  private tourCursorDir = new THREE.Vector3(-0.16, 0.22, 0.96).normalize();
  private tourSpawnedCleanups: (() => void)[] = [];

  constructor(
    container: HTMLElement,
    onStateChange: (updater: (prev: WorldState) => WorldState) => void,
    onHarvestFeedback?: (batch: Partial<HarvestFeedbackBatch>) => void,
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onHarvestFeedback = onHarvestFeedback;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      this.reducedMotion = true;
      this.introSpinActive = false;
    }
    this.initScene();
    this.pixelFx = new QuietPixelEffectsCoordinator(
      this.planetRoot,
      this.terrain.baseRadius,
    );
    const saved = loadWorldFromStorage();
    if (saved) {
      this.restoreFromSerializedSave(saved);
    } else {
      this.populateInitialWorld();
    }
    this.syncCanopyEmitters();
    this.bindEvents();
    this.syncWorldStats();
    this.animate();
  }

  private initScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    let createdRenderer: THREE.WebGLRenderer | null = null;
    try {
      createdRenderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: this.isSoftwareGl ? 'default' : 'high-performance',
      });
    } catch {
      try {
        createdRenderer = new THREE.WebGLRenderer({
          antialias: false,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        createdRenderer = null;
      }
    }

    this.renderer = createdRenderer;

    if (this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
      );
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.container.appendChild(this.renderer.domElement);
    } else {
      const fbCanvas = document.createElement('canvas');
      fbCanvas.width = width;
      fbCanvas.height = height;
      fbCanvas.style.width = `${width}px`;
      fbCanvas.style.height = `${height}px`;
      fbCanvas.style.display = 'block';
      this.fallbackCanvas = fbCanvas;
      this.container.appendChild(fbCanvas);
    }

    this.scene = new THREE.Scene();

    // Camera framed slightly above and to the left so the 30cm orb (3.0 units diameter)
    // fills approximately 60% of the viewport height.
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.08, 60);
    this.applyCameraPreset('orb', true);

    const envMap = createRoomEnvTexture();
    this.scene.environment = envMap;

    // 1. Domestic Room Environment (Windowsill, Linen Cloth, Succulent, Walnut Stand, Brass Collar, Glass Orb)
    this.roomEnv = createRoomEnvironment(envMap);
    this.scene.add(this.roomEnv.group);

    // 2. Room Lighting (Warm evening window light + subdued interior fill)
    this.roomAmbientLight = new THREE.AmbientLight('#f2e6dc', 0.55);
    this.scene.add(this.roomAmbientLight);

    this.roomHemiLight = new THREE.HemisphereLight('#dcd0f0', '#5e4b3e', 0.52);
    this.scene.add(this.roomHemiLight);

    this.roomWindowLight = new THREE.DirectionalLight('#ffdfb8', 1.35);
    this.roomWindowLight.position.set(-4.8, 4.6, 3.8);
    this.roomWindowLight.castShadow = !this.isSoftwareGl;
    this.roomWindowLight.shadow.mapSize.set(
      this.isSoftwareGl ? 512 : 2048,
      this.isSoftwareGl ? 512 : 2048,
    );
    this.roomWindowLight.shadow.camera.near = 1.0;
    this.roomWindowLight.shadow.camera.far = 15.0;
    const d = 3.2;
    this.roomWindowLight.shadow.camera.left = -d;
    this.roomWindowLight.shadow.camera.right = d;
    this.roomWindowLight.shadow.camera.top = d;
    this.roomWindowLight.shadow.camera.bottom = -d;
    this.roomWindowLight.shadow.bias = -0.0005;
    this.scene.add(this.roomWindowLight);

    // 3. Suspended Faceted Planet Root (Centered inside the glass orb at (0,0,0))
    this.planetRoot = new THREE.Group();
    this.scene.add(this.planetRoot);

    this.terrain = createPlanetTerrain();
    this.planetRoot.add(this.terrain.group);

    this.objectsGroup = new THREE.Group();
    this.planetRoot.add(this.objectsGroup);

    this.inhabitantsGroup = new THREE.Group();
    this.planetRoot.add(this.inhabitantsGroup);

    this.atmosphereGroup = new THREE.Group();
    this.planetRoot.add(this.atmosphereGroup);

    this.effectsGroup = new THREE.Group();
    this.planetRoot.add(this.effectsGroup);

    // 4. Celestial Bodies (Small glowing Sun & Pale Moon on opposing sides of curved path)
    this.initCelestialBodies();

    // 5. Drifting Fireflies inside the glass orb (for Twilight / Night mode)
    this.initFireflies();

    // 6. Surface Placement Cursor Ring & Contextual Selection Ring
    const ringGeo = new THREE.RingGeometry(0.028, 0.036, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#fff8d6',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.cursorRing = new THREE.Mesh(ringGeo, ringMat);
    this.cursorRing.visible = false;
    this.planetRoot.add(this.cursorRing);

    const selGeo = new THREE.RingGeometry(0.036, 0.045, 32);
    selGeo.rotateX(-Math.PI / 2);
    const selMat = new THREE.MeshBasicMaterial({
      color: '#ffe082',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.selectionRing = new THREE.Mesh(selGeo, selMat);
    this.selectionRing.visible = false;
    this.planetRoot.add(this.selectionRing);
  }

  private initCelestialBodies() {
    // 1. Radiant Storybook Sun with Sculpted Sunbeam Crown & Astrolabe Ring
    this.sunGroup = new THREE.Group();

    const sunCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.055, 2),
      new THREE.MeshBasicMaterial({ color: '#fff5b8' }),
    );
    this.sunGroup.add(sunCore);

    // Inner & outer rotating sunbeam crowns (12 alternating long/short sculpted rays)
    const rayCrown = new THREE.Group();
    rayCrown.name = 'sunRayCrown';
    const rayPrimaryMat = new THREE.MeshBasicMaterial({ color: '#ffd45c' });
    const raySecondaryMat = new THREE.MeshBasicMaterial({ color: '#ffae36' });

    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const isLong = i % 2 === 0;
      const rayLen = isLong ? 0.036 : 0.024;
      const rayRad = isLong ? 0.011 : 0.0085;
      const rayGeo = new THREE.ConeGeometry(rayRad, rayLen, 4);
      const ray = new THREE.Mesh(
        rayGeo,
        isLong ? rayPrimaryMat : raySecondaryMat,
      );
      const dist = 0.052 + rayLen * 0.45;
      ray.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
      ray.rotation.z = angle - Math.PI / 2;
      rayCrown.add(ray);
    }
    this.sunGroup.add(rayCrown);

    // Delicate tilted golden astrolabe ring around the Sun
    const sunRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.086, 0.0016, 8, 36),
      new THREE.MeshBasicMaterial({
        color: '#ffe28a',
        transparent: true,
        opacity: 0.65,
      }),
    );
    sunRing.name = 'sunAstrolabeRing';
    sunRing.rotation.set(0.65, 0.35, 0);
    this.sunGroup.add(sunRing);

    const sunHalo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.098, 2),
      new THREE.MeshBasicMaterial({
        color: '#ffbe4f',
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    this.sunGroup.add(sunHalo);
    this.planetRoot.add(this.sunGroup);

    // Little sun directional light casting moving shadows across the planet
    this.sunLight = new THREE.DirectionalLight('#fff0c2', 1.9);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(
      this.isSoftwareGl ? 512 : 1024,
      this.isSoftwareGl ? 512 : 1024,
    );
    this.sunLight.shadow.camera.near = 0.2;
    this.sunLight.shadow.camera.far = 3.5;
    const sd = 1.05;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0008;
    this.planetRoot.add(this.sunLight);
    this.planetRoot.add(this.sunLight.target);

    // 2. Detailed Cratered Moon with Lunar Mare Basins & Companion Starlets
    this.moonGroup = new THREE.Group();
    const moonMat = new THREE.MeshStandardMaterial({
      color: '#e8effc',
      emissive: new THREE.Color('#8eabdc'),
      emissiveIntensity: 0.55,
      roughness: 0.72,
      flatShading: true,
    });
    const craterMat = new THREE.MeshStandardMaterial({
      color: '#bccbe6',
      emissive: new THREE.Color('#6b88b8'),
      emissiveIntensity: 0.45,
      roughness: 0.82,
      flatShading: true,
    });

    const moonBody = new THREE.Group();
    moonBody.name = 'moonBody';

    const moonMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.052, 2),
      moonMat,
    );
    moonBody.add(moonMesh);

    // Sculpted rimmed craters & lunar basins on the Moon surface
    const craterSpecs: [number, number, number, number][] = [
      [0.35, 0.25, 0.9, 0.013],
      [-0.48, 0.38, 0.79, 0.0105],
      [0.18, -0.52, 0.83, 0.0115],
      [-0.65, -0.25, 0.71, 0.009],
      [0.58, 0.42, -0.69, 0.012],
      [-0.25, 0.68, -0.69, 0.01],
      [0.12, -0.74, -0.66, 0.011],
    ];
    for (const [cx, cy, cz, cr] of craterSpecs) {
      const dir = new THREE.Vector3(cx, cy, cz).normalize();
      const craterGroup = new THREE.Group();
      craterGroup.position.copy(dir.clone().multiplyScalar(0.0505));
      craterGroup.lookAt(dir.clone().multiplyScalar(0.15));

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(cr, cr * 0.26, 6, 12),
        craterMat,
      );
      const basin = new THREE.Mesh(
        new THREE.CircleGeometry(cr * 0.85, 10),
        craterMat,
      );
      basin.position.z = -0.0008;
      craterGroup.add(rim, basin);
      moonBody.add(craterGroup);
    }
    this.moonGroup.add(moonBody);

    // Orbiting silver companion starlets around the Moon
    const starletGroup = new THREE.Group();
    starletGroup.name = 'moonStarlets';
    const starletMat = new THREE.MeshBasicMaterial({ color: '#eef5ff' });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const starlet = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.0055 - i * 0.001, 0),
        starletMat,
      );
      starlet.position.set(
        Math.cos(angle) * 0.078,
        Math.sin(angle * 1.5) * 0.018,
        Math.sin(angle) * 0.078,
      );
      starletGroup.add(starlet);
    }
    this.moonGroup.add(starletGroup);

    const moonHalo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.076, 2),
      new THREE.MeshBasicMaterial({
        color: '#b5d0ff',
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    this.moonGroup.add(moonHalo);
    this.planetRoot.add(this.moonGroup);

    // Moon directional light to illuminate silver edges on terrain at night
    this.moonLight = new THREE.DirectionalLight('#b8d4ff', 0.0);
    this.planetRoot.add(this.moonLight);
    this.planetRoot.add(this.moonLight.target);
  }

  private initFireflies() {
    const count = 38;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distributed in the atmosphere shell between planet (0.82) and inner glass orb (1.36)
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const r = 0.84 + Math.random() * 0.48;
      const pos = dir.multiplyScalar(r);
      this.firefliesBasePositions.push(pos);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Soft circular glow sprite texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 248, 150, 1)');
    grad.addColorStop(0.4, 'rgba(215, 245, 110, 0.65)');
    grad.addColorStop(1, 'rgba(180, 230, 80, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(canvas);

    this.firefliesMat = new THREE.PointsMaterial({
      map: spriteTex,
      size: 0.065,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.firefliesPoints = new THREE.Points(geo, this.firefliesMat);
    this.planetRoot.add(this.firefliesPoints);
  }

  private populateInitialWorld() {
    // 1. Stone Well at the center of "Little Meadow"
    this.placeStaticObject('well', this.wellDirection, 0, false, false);

    // 2. Ten Pastel Houses distributed across the globe in four distinct neighborhoods
    const westSquare = new THREE.Vector3(-0.80, 0.24, 0.54).normalize();
    const eastBackSquare = new THREE.Vector3(0.54, -0.24, -0.80).normalize();
    const southSquare = new THREE.Vector3(-0.04, -0.66, -0.75).normalize();

    const houseConfigs: { dir: THREE.Vector3; hub: THREE.Vector3 }[] = [
      // Front Meadow Village (+Z) — spaced generously around the stone well
      { dir: new THREE.Vector3(-0.36, 0.30, 0.88).normalize(), hub: this.wellDirection },
      { dir: new THREE.Vector3(-0.01, 0.38, 0.92).normalize(), hub: this.wellDirection },
      { dir: new THREE.Vector3(-0.38, 0.08, 0.92).normalize(), hub: this.wellDirection },
      { dir: new THREE.Vector3(0.08, 0.12, 0.99).normalize(), hub: this.wellDirection },
      // Western Sunset Ridge (-X)
      { dir: new THREE.Vector3(-0.74, 0.36, 0.56).normalize(), hub: westSquare },
      { dir: new THREE.Vector3(-0.88, 0.16, 0.44).normalize(), hub: westSquare },
      // Back-Eastern Highland Hamlet (+X / -Z)
      { dir: new THREE.Vector3(0.64, -0.14, -0.75).normalize(), hub: eastBackSquare },
      { dir: new THREE.Vector3(0.38, -0.36, -0.85).normalize(), hub: eastBackSquare },
      { dir: new THREE.Vector3(0.82, 0.14, -0.55).normalize(), hub: eastBackSquare },
      // Southern Valley Overlook (-Y / -Z)
      { dir: new THREE.Vector3(-0.14, -0.64, -0.76).normalize(), hub: southSquare },
    ];

    const initialHouses: PlacedObjectEntity[] = [];
    houseConfigs.forEach(({ dir, hub }, idx) => {
      const houseYaw = this.computeYawFacingTarget(dir, hub);
      const hObj = this.placeStaticObject('house', dir, houseYaw, true, false);
      initialHouses.push(hObj);

      // Add stepping stone path outside each cottage's front doorstep toward its neighborhood square
      const doorDir = this.getBuildingEntranceDir(hObj, 0);
      const midDir = doorDir.clone().lerp(hub, 0.42).normalize();
      const pathYaw = this.computeYawFacingTarget(midDir, hub);
      this.placeStaticObject('path', midDir, pathYaw + idx * 0.1, true, false);
    });

    // 3. White Windmill on the breezy western knoll overlooking the meadow
    const windmillDir = new THREE.Vector3(-0.52, 0.36, 0.77).normalize();
    const windmillYaw = this.computeYawFacingTarget(windmillDir, this.wellDirection);
    this.placeStaticObject('windmill', windmillDir, windmillYaw, true, false);

    // 4. Striped Cliff-Top Lighthouse on the eastern coastal promontory overlooking Sea 1
    const lighthouseDir = new THREE.Vector3(0.62, 0.34, 0.71).normalize();
    this.placeStaticObject('lighthouse', lighthouseDir, -0.4, true, false);

    // 5. Continuous 10-Segment Tangential Wooden Fence Corral enclosing the Sheep Pasture
    const pRight = new THREE.Vector3()
      .crossVectors(UP_VEC, this.pastureCenter)
      .normalize();
    const pUp = new THREE.Vector3()
      .crossVectors(this.pastureCenter, pRight)
      .normalize();
    const fenceSegments = 10;
    for (let i = 0; i < fenceSegments; i++) {
      const angle = (i / fenceSegments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const fDir = this.pastureCenter
        .clone()
        .addScaledVector(pRight, cosA * this.pastureRadius)
        .addScaledVector(pUp, sinA * this.pastureRadius)
        .normalize();
      const outwardDir = this.pastureCenter
        .clone()
        .addScaledVector(pRight, cosA * (this.pastureRadius + 0.08))
        .addScaledVector(pUp, sinA * (this.pastureRadius + 0.08))
        .normalize();
      // Align local +Z outward so the fence's local X rails run strictly tangent to the pasture perimeter
      const fenceYaw = this.computeYawFacingTarget(fDir, outwardDir);
      this.placeStaticObject('fence', fDir, fenceYaw, true, false);
    }

    // 6. Rounded Oaks across the grassy hills around the globe
    const oakDirs = [
      new THREE.Vector3(-0.48, 0.48, 0.73).normalize(),
      new THREE.Vector3(-0.22, 0.52, 0.82).normalize(),
      new THREE.Vector3(0.24, 0.46, 0.85).normalize(),
      new THREE.Vector3(-0.66, 0.18, 0.73).normalize(),
      new THREE.Vector3(-0.58, -0.28, 0.76).normalize(),
      new THREE.Vector3(0.15, -0.56, 0.81).normalize(),
      new THREE.Vector3(0.45, 0.58, -0.68).normalize(),
      new THREE.Vector3(-0.32, 0.42, -0.85).normalize(),
      new THREE.Vector3(0.76, 0.32, -0.56).normalize(),
      new THREE.Vector3(-0.86, -0.18, 0.48).normalize(),
      new THREE.Vector3(0.22, -0.62, -0.75).normalize(),
    ];
    oakDirs.forEach((d, i) => {
      this.placeStaticObject('oak', d, i * 1.7, true, false);
    });

    // 7. Narrow Pines near the northern snowy mountain & high ridges
    const pineDirs = [
      new THREE.Vector3(0.05, 0.78, 0.62).normalize(),
      new THREE.Vector3(-0.18, 0.82, 0.54).normalize(),
      new THREE.Vector3(0.28, 0.79, 0.54).normalize(),
      new THREE.Vector3(0.35, 0.84, -0.41).normalize(),
      new THREE.Vector3(-0.26, 0.86, -0.44).normalize(),
      new THREE.Vector3(0.02, 0.88, -0.47).normalize(),
      new THREE.Vector3(-0.42, 0.74, 0.52).normalize(),
    ];
    pineDirs.forEach((d, i) => {
      this.placeStaticObject('pine', d, i * 2.1, true, false);
    });

    // 8. Palms beside the coast (along sandy beaches of both turquoise seas)
    const palmDirs = [
      new THREE.Vector3(0.32, -0.08, 0.94).normalize(),
      new THREE.Vector3(0.38, -0.26, 0.88).normalize(),
      new THREE.Vector3(0.52, 0.14, 0.84).normalize(),
      new THREE.Vector3(0.84, -0.05, 0.54).normalize(),
      new THREE.Vector3(-0.38, -0.18, -0.91).normalize(),
      new THREE.Vector3(-0.88, 0.12, -0.46).normalize(),
    ];
    palmDirs.forEach((d, i) => {
      this.placeStaticObject('palm', d, i * 1.4, true, false);
    });

    // 9. Meadow Flowers across the neighborhoods
    const flowerDirs = [
      new THREE.Vector3(-0.26, 0.34, 0.90).normalize(),
      new THREE.Vector3(0.06, 0.28, 0.96).normalize(),
      new THREE.Vector3(-0.82, 0.28, 0.50).normalize(),
      new THREE.Vector3(0.48, -0.18, -0.86).normalize(),
      new THREE.Vector3(-0.04, -0.58, -0.81).normalize(),
    ];
    flowerDirs.forEach((d, i) => {
      this.placeStaticObject('flower', d, i * 0.9, true, false);
    });

    // 10. Cozy Village & Global Landmarks (Campfires, Beehives, Lanterns away from the well, Watchtower, Dock)
    this.placeStaticObject(
      'campfire',
      new THREE.Vector3(-0.18, 0.05, 0.98).normalize(),
      0.4,
      true,
      false,
    );
    this.placeStaticObject(
      'campfire',
      eastBackSquare,
      1.1,
      true,
      false,
    );
    this.placeStaticObject(
      'beehive',
      new THREE.Vector3(-0.15, 0.44, 0.88).normalize(),
      0.8,
      true,
      false,
    );
    this.placeStaticObject(
      'beehive',
      new THREE.Vector3(-0.82, 0.04, 0.57).normalize(),
      -0.6,
      true,
      false,
    );
    // Streetlamps positioned along outer avenues across the globe, far clear of the stone well plaza
    const lanternDirs = [
      new THREE.Vector3(-0.28, 0.44, 0.85).normalize(),
      new THREE.Vector3(0.18, 0.26, 0.95).normalize(),
      new THREE.Vector3(-0.78, 0.22, 0.58).normalize(),
      new THREE.Vector3(0.48, -0.28, -0.83).normalize(),
    ];
    lanternDirs.forEach((lDir, idx) => {
      this.placeStaticObject('lantern', lDir, idx * 0.9 - 0.4, true, false);
    });
    const watchtowerDir = new THREE.Vector3(-0.34, 0.65, 0.68).normalize();
    const watchtowerYaw = this.computeYawFacingTarget(
      watchtowerDir,
      this.wellDirection,
    );
    this.placeStaticObject(
      'watchtower',
      watchtowerDir,
      watchtowerYaw,
      true,
      false,
    );
    const dockDir = new THREE.Vector3(0.285, -0.04, 0.958).normalize();
    this.placeStaticObject(
      'dock',
      dockDir,
      1.50,
      true,
      false,
    );
    const dockShorePathDir = new THREE.Vector3(0.19, -0.02, 0.981).normalize();
    const dockShorePathYaw = this.computeYawFacingTarget(dockShorePathDir, dockDir);
    this.placeStaticObject('path', dockShorePathDir, dockShorePathYaw, true, false);

    // 11. Water Life: Sailboats & Paddling Swans/Ducks on the turquoise seas
    this.spawnSailboat(new THREE.Vector3(0.62, -0.14, 0.77).normalize(), false);
    this.spawnSailboat(new THREE.Vector3(-0.66, -0.14, -0.73).normalize(), false);
    this.spawnDuckFlock(new THREE.Vector3(0.52, -0.22, 0.82).normalize(), false);

    // 12. Hot Air Balloon drifting gently in the upper atmosphere
    this.spawnBalloon(new THREE.Vector3(0.35, 0.52, 0.78).normalize(), false);

    // 13. Twelve Villagers distributed across the 10 houses around the entire globe
    for (let i = 0; i < 12; i++) {
      const homeObj = initialHouses[i % initialHouses.length];
      const lateral = ((i % 3) - 1) * 0.016;
      const startDir = this.getBuildingEntranceDir(homeObj, lateral);
      this.spawnVillager(startDir, false);
    }

    // 14. Eight White Sheep grazing safely inside the fenced sheep pasture corral
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
      const radialDist = i < 3 ? 0.028 : 0.056;
      const sDir = this.pastureCenter
        .clone()
        .addScaledVector(pRight, Math.cos(angle) * radialDist)
        .addScaledVector(pUp, Math.sin(angle) * radialDist)
        .normalize();
      this.spawnSheep(sDir, false, true);
    }

    // 15. Three Puffy Clouds following curved paths around the world
    const cloudDirs = [
      new THREE.Vector3(-0.28, 0.38, 0.88).normalize(),
      new THREE.Vector3(0.68, 0.25, -0.68).normalize(),
      new THREE.Vector3(-0.55, -0.48, -0.68).normalize(),
    ];
    cloudDirs.forEach((d, idx) => {
      this.spawnCloud(d, false, idx === 0 ? 3.5 : 8.0 + idx * 4.0, false);
    });

    // 16. Six Cultivated Garden Plots near the Village & Windmill (spanning lifecycle states)
    const initialPlots: {
      dir: THREE.Vector3;
      cropType: CropType;
      growth: number;
      moisture: number;
      composted: boolean;
      hasCrop: boolean;
      harvested: boolean;
    }[] = [
      {
        dir: new THREE.Vector3(-0.44, 0.24, 0.86).normalize(),
        cropType: 'wheat',
        growth: 1.0,
        moisture: 0.85,
        composted: true,
        hasCrop: true,
        harvested: false,
      },
      {
        dir: new THREE.Vector3(-0.46, 0.16, 0.87).normalize(),
        cropType: 'wheat',
        growth: 0.62,
        moisture: 0.72,
        composted: false,
        hasCrop: true,
        harvested: false,
      },
      {
        dir: new THREE.Vector3(-0.24, 0.14, 0.96).normalize(),
        cropType: 'berry',
        growth: 1.0,
        moisture: 0.88,
        composted: true,
        hasCrop: true,
        harvested: false,
      },
      {
        dir: new THREE.Vector3(-0.08, 0.28, 0.95).normalize(),
        cropType: 'berry',
        growth: 0.28,
        moisture: 0.58,
        composted: false,
        hasCrop: true,
        harvested: false,
      },
      {
        dir: new THREE.Vector3(-0.18, 0.36, 0.91).normalize(),
        cropType: 'pumpkin',
        growth: 0.52,
        moisture: 0.64,
        composted: true,
        hasCrop: true,
        harvested: false,
      },
      {
        dir: new THREE.Vector3(0.02, 0.22, 0.97).normalize(),
        cropType: 'berry',
        growth: 0.0,
        moisture: 0.65,
        composted: false,
        hasCrop: false,
        harvested: false,
      },
    ];

    initialPlots.forEach((p, idx) => {
      const plotObj = this.placeGardenPlot(
        p.cropType,
        p.dir,
        idx * 0.4,
        p.growth,
        p.moisture,
        p.composted,
        false,
        {
          hasCrop: p.hasCrop,
          harvested: p.harvested,
        },
      );
      this.updatePlotVisuals(plotObj);
    });
  }

  private getObjectCollisionRadius(type: PlacedObjectType): number {
    switch (type) {
      case 'plot':
        return 0.032;
      case 'house':
        return 0.054;
      case 'windmill':
        return 0.056;
      case 'lighthouse':
        return 0.056;
      case 'watchtower':
        return 0.054;
      case 'well':
        return 0.035;
      case 'campfire':
        return 0.032;
      case 'beehive':
        return 0.025;
      case 'oak':
        return 0.022;
      case 'pine':
        return 0.019;
      case 'palm':
        return 0.019;
      case 'lantern':
        return 0.011;
      default:
        return 0;
    }
  }

  private computeYawFacingTarget(
    dir: THREE.Vector3,
    targetDir: THREE.Vector3,
  ): number {
    const surface = this.terrain.getSurfacePointAndNormal(dir);
    const tangent = targetDir
      .clone()
      .sub(dir)
      .projectOnPlane(surface.normal)
      .normalize();
    if (tangent.lengthSq() < 1e-6) return 0;
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(
      UP_VEC,
      surface.normal,
    );
    const localTangent = tangent
      .clone()
      .applyQuaternion(alignQuat.clone().invert());
    return Math.atan2(localTangent.x, localTangent.z);
  }

  private getBuildingEntranceDir(
    obj: PlacedObjectEntity,
    lateralOffset = 0,
  ): THREE.Vector3 {
    const surface = this.terrain.getSurfacePointAndNormal(obj.dir);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(
      UP_VEC,
      surface.normal,
    );
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, obj.yaw);
    const fullQuat = alignQuat.multiply(yawQuat);

    if (obj.type === 'dock' || obj.type === 'bridge') {
      // Approach the landward end of the dock or bridge
      const reach = obj.type === 'dock' ? 0.068 : 0.038;
      const axisZ = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(fullQuat)
        .normalize();
      const endA = obj.dir.clone().addScaledVector(axisZ, -reach).normalize();
      const endB = obj.dir.clone().addScaledVector(axisZ, reach).normalize();
      const surfA = this.terrain.getSurfacePointAndNormal(endA);
      return !surfA.isWater ? endA : endB;
    }

    const frontTangent = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(fullQuat)
      .normalize();
    const rightTangent = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(fullQuat)
      .normalize();
    const clearance = this.getObjectCollisionRadius(obj.type) + 0.022;

    const candidate = obj.dir
      .clone()
      .addScaledVector(frontTangent, clearance)
      .addScaledVector(rightTangent, lateralOffset)
      .normalize();

    // Ensure the entrance point itself isn't underwater
    const candSurf = this.terrain.getSurfacePointAndNormal(candidate);
    if (!candSurf.isWater) {
      return candidate;
    }
    return obj.dir
      .clone()
      .addScaledVector(frontTangent, -clearance)
      .normalize();
  }

  private getFenceSegmentOnSphere(fenceObj: PlacedObjectEntity): {
    segA: THREE.Vector3;
    segB: THREE.Vector3;
    railAxis: THREE.Vector3;
  } {
    const surface = this.terrain.getSurfacePointAndNormal(fenceObj.dir);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(
      UP_VEC,
      surface.normal,
    );
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      UP_VEC,
      fenceObj.yaw,
    );
    const fullQuat = alignQuat.multiply(yawQuat);
    const railAxis = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(fullQuat)
      .normalize();
    const halfSpan = 0.035;
    const segA = fenceObj.dir
      .clone()
      .addScaledVector(railAxis, -halfSpan)
      .normalize();
    const segB = fenceObj.dir
      .clone()
      .addScaledVector(railAxis, halfSpan)
      .normalize();
    return { segA, segB, railAxis };
  }

  private closestPointOnSphereSegment(
    pt: THREE.Vector3,
    segA: THREE.Vector3,
    segB: THREE.Vector3,
  ): THREE.Vector3 {
    const ab = segB.clone().sub(segA);
    const lenSq = ab.lengthSq();
    if (lenSq < 1e-8) return segA.clone();
    const ap = pt.clone().sub(segA);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / lenSq, 0, 1);
    return segA.clone().addScaledVector(ab, t).normalize();
  }

  private getRainbowFootDirs(
    dir: THREE.Vector3,
    yaw: number,
  ): [THREE.Vector3, THREE.Vector3] {
    const surface = this.terrain.getSurfacePointAndNormal(dir);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(
      UP_VEC,
      surface.normal,
    );
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, yaw);
    const fullQuat = alignQuat.multiply(yawQuat);
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(fullQuat);
    const footA = surface.point.clone().addScaledVector(xAxis, -0.058).normalize();
    const footB = surface.point.clone().addScaledVector(xAxis, 0.058).normalize();
    return [footA, footB];
  }

  private findCollisionFreeRainbowYaw(dir: THREE.Vector3): number {
    let bestYaw = -0.25;
    let bestScore = -999;
    const surf = this.terrain.getSurfacePointAndNormal(dir);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(
      UP_VEC,
      surf.normal,
    );

    for (let step = 0; step < 24; step++) {
      const candidateYaw = (step / 24) * Math.PI;
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, candidateYaw);
      const q = alignQuat.clone().multiply(yawQuat);
      let minClear = 999;

      for (let aStep = 0; aStep <= 8; aStep++) {
        const a = (aStep / 8) * Math.PI;
        const lx = Math.cos(a) * 0.068;
        const ly = 0.016 + Math.sin(a) * 0.068;
        const pt = new THREE.Vector3(lx, ly, 0).applyQuaternion(q).add(surf.point);
        const ptDir = pt.clone().normalize();

        for (const obj of this.placedObjects) {
          const r = this.getObjectCollisionRadius(obj.type);
          if (r <= 0) continue;
          const d = ptDir.distanceTo(obj.dir) * 0.75 - (r + 0.024);
          if (d < minClear) minClear = d;
        }
      }

      if (minClear > bestScore) {
        bestScore = minClear;
        bestYaw = candidateYaw;
      }
    }
    return bestYaw;
  }

  private isPositionClearOfObstacles(
    dir: THREE.Vector3,
    extraMargin = 0.012,
    allowInsidePasture = false,
  ): boolean {
    const surf = this.terrain.getSurfacePointAndNormal(dir);
    if (surf.isWater || surf.isMountain) return false;
    if (surf.normal.dot(dir) < 0.75) return false;

    if (
      !allowInsidePasture &&
      dir.distanceTo(this.pastureCenter) < this.pastureRadius + extraMargin
    ) {
      return false;
    }

    for (const obj of this.placedObjects) {
      if (obj.type === 'fence') {
        const { segA, segB } = this.getFenceSegmentOnSphere(obj);
        const closest = this.closestPointOnSphereSegment(dir, segA, segB);
        if (dir.distanceTo(closest) < 0.015 + extraMargin) {
          return false;
        }
        continue;
      }
      if (obj.type === 'rainbow') {
        const [footA, footB] = this.getRainbowFootDirs(obj.dir, obj.yaw);
        if (
          dir.distanceTo(footA) < 0.026 + extraMargin ||
          dir.distanceTo(footB) < 0.026 + extraMargin
        ) {
          return false;
        }
        continue;
      }
      const r = this.getObjectCollisionRadius(obj.type);
      if (r > 0 && dir.distanceTo(obj.dir) < r + extraMargin) {
        return false;
      }
    }
    return true;
  }

  private orientObjectOnSurface(
    obj: THREE.Object3D,
    dir: THREE.Vector3,
    yaw: number,
    normalOffset = 0,
    stickToSeaLevel = false,
    useRadialUp = false,
  ) {
    const surface = this.terrain.getSurfacePointAndNormal(dir);
    const normDir = dir.clone().normalize();
    const basePoint = stickToSeaLevel
      ? normDir.clone().multiplyScalar(this.terrain.seaLevel)
      : surface.point;
    const upNormal = stickToSeaLevel || useRadialUp ? normDir : surface.normal;

    const pos = basePoint.clone().addScaledVector(upNormal, normalOffset);
    obj.position.copy(pos);

    const alignQuat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, upNormal);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, yaw);
    obj.quaternion.copy(alignQuat).multiply(yawQuat);
  }

  public placeStaticObject(
    type: PlacedObjectType,
    dir: THREE.Vector3,
    yaw = Math.random() * Math.PI * 2,
    removable = true,
    withSparkles = true,
  ): PlacedObjectEntity {
    const normDir = dir.clone().normalize();
    let meshGroup: THREE.Group;
    let windmillRotor: THREE.Object3D | undefined;
    let lighthouseBeamPivot: THREE.Object3D | undefined;
    let lighthouseConeMats: THREE.MeshBasicMaterial[] | undefined;
    let lighthousePointLight: THREE.PointLight | undefined;
    let windowMaterials: THREE.MeshStandardMaterial[] | undefined;
    let campfireFlameGroup: THREE.Group | undefined;
    let campfireEmbers: THREE.Points | undefined;
    let campfireLight: THREE.PointLight | undefined;
    let watchtowerFlag: THREE.Mesh | undefined;
    let butterflySwarm: THREE.Group | undefined;

    if (type === 'house') {
      const res = createPastelHouseMesh(this.houseCounter++);
      meshGroup = res.group;
      windowMaterials = res.windowMaterials;
    } else if (type === 'windmill') {
      const res = createWhiteWindmillMesh();
      meshGroup = res.group;
      windmillRotor = res.rotor;
      windowMaterials = res.windowMaterials;
    } else if (type === 'lighthouse') {
      const res = createStripedLighthouseMesh();
      meshGroup = res.group;
      lighthouseBeamPivot = res.beamPivot;
      lighthouseConeMats = res.coneMats;
      lighthousePointLight = res.pointLight;
      windowMaterials = res.windowMaterials;
    } else if (type === 'well') {
      meshGroup = createStoneWellMesh();
    } else if (type === 'fence') {
      meshGroup = createWoodenFenceMesh();
    } else if (type === 'path') {
      meshGroup = createSteppingPathMesh();
    } else if (type === 'oak') {
      meshGroup = createOakTreeMesh();
    } else if (type === 'pine') {
      const surface = this.terrain.getSurfacePointAndNormal(normDir);
      meshGroup = createPineTreeMesh(surface.isMountain || normDir.y > 0.65);
    } else if (type === 'palm') {
      meshGroup = createPalmTreeMesh();
    } else if (type === 'dock' || type === 'bridge') {
      const res = createWoodenDockMesh(type === 'bridge');
      meshGroup = res.group;
      windowMaterials = res.windowMaterials;
    } else if (type === 'campfire') {
      const res = createCampfireMesh();
      meshGroup = res.group;
      campfireFlameGroup = res.flameGroup;
      campfireEmbers = res.embers;
      campfireLight = res.light;
    } else if (type === 'watchtower') {
      const res = createStoneWatchtowerMesh();
      meshGroup = res.group;
      watchtowerFlag = res.flagMesh;
      windowMaterials = res.windowMaterials;
    } else if (type === 'beehive') {
      const res = createBeehiveMesh();
      meshGroup = res.group;
      butterflySwarm = res.butterflySwarm;
    } else if (type === 'lantern') {
      const res = createLanternPostMesh();
      meshGroup = res.group;
      windowMaterials = res.windowMaterials;
    } else if (type === 'rainbow') {
      meshGroup = createRainbowArchMesh();
    } else {
      meshGroup = createFlowerClusterMesh();
    }

    const stickToSea = type === 'dock' || type === 'bridge';
    const useRadialUp = stickToSea || type === 'lighthouse';
    this.orientObjectOnSurface(meshGroup, normDir, yaw, 0, stickToSea, useRadialUp);
    this.objectsGroup.add(meshGroup);

    const isTree = type === 'oak' || type === 'pine' || type === 'palm';
    const initialGrowth = isTree ? 0.82 + Math.random() * 0.22 : 1.0;

    const entity: PlacedObjectEntity = {
      id: `${type}_${Date.now()}_${Math.random()}`,
      type,
      dir: normDir,
      yaw,
      mesh: meshGroup,
      baseScale: 1.0,
      growth: initialGrowth,
      targetGrowth: initialGrowth,
      bounceTime: withSparkles ? 0.0 : 10.0,
      bounceActive: withSparkles,
      isProcessing: false,
      productionTimer: 0,
      storedOutput: type === 'beehive' ? 1 : 0,
      windmillRotor,
      lighthouseBeamPivot,
      lighthouseConeMats,
      lighthousePointLight,
      windowMaterials,
      campfireFlameGroup,
      campfireEmbers,
      campfireLight,
      watchtowerFlag,
      butterflySwarm,
      removable,
    };

    if (withSparkles && !this.reducedMotion) {
      meshGroup.scale.setScalar(0.01);
      this.emitSparklesAtDir(normDir, '#ffe484');
    } else {
      meshGroup.scale.setScalar(initialGrowth);
    }

    this.placedObjects.push(entity);
    if (type === 'oak') {
      this.syncCanopyEmitters();
    }
    return entity;
  }

  public placeGardenPlot(
    cropType: CropType,
    dir: THREE.Vector3,
    yaw = 0,
    initialGrowth = 0.04,
    initialMoisture = 0.78,
    composted = false,
    withSparkles = true,
    options?: {
      id?: string;
      hasCrop?: boolean;
      harvested?: boolean;
      hasCloche?: boolean;
    },
  ): PlacedObjectEntity {
    const normDir = dir.clone().normalize();
    const { group, parts } = createGardenPlotMesh(cropType);
    this.orientObjectOnSurface(group, normDir, yaw, 0, false, false);
    this.objectsGroup.add(group);

    const hasCrop = options?.hasCrop ?? true;
    const harvested = options?.harvested ?? false;

    const entity: PlacedObjectEntity = {
      id: options?.id || `plot_${cropType}_${Date.now()}_${Math.random()}`,
      type: 'plot',
      dir: normDir,
      yaw,
      mesh: group,
      baseScale: 1.0,
      growth: hasCrop ? initialGrowth : 0.0,
      targetGrowth: 1.0,
      bounceTime: withSparkles && !this.reducedMotion ? 0.0 : 10.0,
      bounceActive: withSparkles && !this.reducedMotion,
      cropType,
      hasCrop,
      harvested,
      hasCloche: Boolean(options?.hasCloche),
      reservedByVillagerId: null,
      moisture: initialMoisture,
      composted,
      plotParts: parts,
      removable: true,
    };

    this.updatePlotVisuals(entity);
    if (withSparkles) {
      this.emitSparklesAtDir(normDir, '#b8e986');
    }

    this.placedObjects.push(entity);
    return entity;
  }

  private getPlotLifecycle(plot: PlacedObjectEntity): PlotLifecycleState {
    return computePlotLifecycleState(
      plot.hasCrop ?? true,
      Boolean(plot.harvested),
      plot.growth,
    );
  }

  private updatePlotVisuals(plot: PlacedObjectEntity) {
    if (plot.type !== 'plot' || !plot.plotParts) return;
    const {
      soilMat,
      compostGroup,
      seedDotsGroup,
      sproutsGroup,
      matureGroup,
      harvestedStubbleGroup,
      clocheGroup,
    } = plot.plotParts;

    const moisture = THREE.MathUtils.clamp(plot.moisture ?? 0.5, 0, 1);
    // Darker rich loam when well-hydrated, lighter warm soil when dry
    soilMat.color.setHSL(0.07, 0.36, THREE.MathUtils.lerp(0.33, 0.16, moisture));
    compostGroup.visible = Boolean(plot.composted);
    clocheGroup.visible = Boolean(plot.hasCloche);

    const state = this.getPlotLifecycle(plot);
    const g = THREE.MathUtils.clamp(plot.growth, 0, 1);

    if (state === 'prepared') {
      seedDotsGroup.visible = false;
      sproutsGroup.visible = false;
      matureGroup.visible = false;
      harvestedStubbleGroup.visible = false;
    } else if (state === 'harvested') {
      seedDotsGroup.visible = false;
      sproutsGroup.visible = false;
      matureGroup.visible = false;
      harvestedStubbleGroup.visible = true;
    } else if (state === 'sown') {
      seedDotsGroup.visible = true;
      sproutsGroup.visible = false;
      matureGroup.visible = false;
      harvestedStubbleGroup.visible = false;
    } else if (state === 'seedling') {
      seedDotsGroup.visible = false;
      sproutsGroup.visible = true;
      const t = THREE.MathUtils.clamp((g - 0.12) / 0.3, 0, 1);
      sproutsGroup.scale.setScalar(0.38 + t * 0.62);
      matureGroup.visible = false;
      harvestedStubbleGroup.visible = false;
    } else if (state === 'growing') {
      seedDotsGroup.visible = false;
      sproutsGroup.visible = true;
      sproutsGroup.scale.setScalar(1.0);
      matureGroup.visible = true;
      const t = THREE.MathUtils.clamp((g - 0.42) / 0.575, 0, 1);
      matureGroup.scale.setScalar(0.18 + t * 0.76);
      harvestedStubbleGroup.visible = false;
    } else {
      // 'ripe'
      seedDotsGroup.visible = false;
      sproutsGroup.visible = true;
      sproutsGroup.scale.setScalar(1.0);
      matureGroup.visible = true;
      matureGroup.scale.setScalar(1.05);
      harvestedStubbleGroup.visible = false;
    }
  }

  private spawnSailboat(dir: THREE.Vector3, withSparkles = true) {
    let waterDir = dir.clone().normalize();
    const surf = this.terrain.getSurfacePointAndNormal(waterDir);
    if (!surf.isWater) {
      const nearestWater = this.terrain.findNearestWaterDirection(waterDir, 0.95);
      if (nearestWater) {
        waterDir = nearestWater;
      } else {
        this.terrain.sculptAtDirection(waterDir, 'lake');
        this.realignAllObjectsToTerrain();
      }
    }

    const { group, hullGroup, lanternMat } = createSailboatMesh(this.boatCounter++);
    const yaw = Math.random() * Math.PI * 2;
    this.orientObjectOnSurface(group, waterDir, yaw, 0, true);
    this.inhabitantsGroup.add(group);

    const targetDir = this.pickRandomWaterTarget(waterDir);
    const entity: SailboatEntity = {
      id: `sailboat_${Date.now()}_${Math.random()}`,
      mesh: group,
      hullGroup,
      lanternMat,
      dir: waterDir,
      targetDir,
      speed: 0.048 + Math.random() * 0.02,
      bobPhase: Math.random() * Math.PI * 2,
      yaw,
    };

    if (withSparkles) {
      this.emitSparklesAtDir(waterDir, '#7ef2e6', this.terrain.seaLevel);
    }

    this.sailboats.push(entity);
  }

  private spawnDuckFlock(dir: THREE.Vector3, withSparkles = true) {
    let waterDir = dir.clone().normalize();
    const surf = this.terrain.getSurfacePointAndNormal(waterDir);
    if (!surf.isWater) {
      const nearestWater = this.terrain.findNearestWaterDirection(waterDir, 0.95);
      if (nearestWater) {
        waterDir = nearestWater;
      } else {
        this.terrain.sculptAtDirection(waterDir, 'lake');
        this.realignAllObjectsToTerrain();
      }
    }

    const { group, rippleRings } = createSwanDuckFlockMesh();
    const yaw = Math.random() * Math.PI * 2;
    this.orientObjectOnSurface(group, waterDir, yaw, 0, true);
    this.inhabitantsGroup.add(group);

    const targetDir = this.pickRandomWaterTarget(waterDir);
    const entity: DuckEntity = {
      id: `duck_${Date.now()}_${Math.random()}`,
      mesh: group,
      rippleRings,
      dir: waterDir,
      targetDir,
      speed: 0.028 + Math.random() * 0.015,
      bobPhase: Math.random() * Math.PI * 2,
      yaw,
    };

    if (withSparkles) {
      this.emitSparklesAtDir(waterDir, '#ffffff', this.terrain.seaLevel);
    }

    this.ducks.push(entity);
  }

  private pickRandomWaterTarget(fromDir: THREE.Vector3): THREE.Vector3 {
    for (let attempt = 0; attempt < 24; attempt++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.36,
        (Math.random() - 0.5) * 0.36,
        (Math.random() - 0.5) * 0.36,
      );
      const candidate = fromDir.clone().add(offset).normalize();
      const surf = this.terrain.getSurfacePointAndNormal(candidate);
      if (surf.isWater) {
        return candidate;
      }
    }
    return this.terrain.findNearestWaterDirection(fromDir, 0.8) || fromDir.clone();
  }

  private spawnBalloon(dir: THREE.Vector3, withSparkles = true) {
    const normDir = dir.clone().normalize();
    const { group, burnerMat } = createHotAirBalloonMesh(this.balloonCounter++);

    const randVec = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() + 0.5,
      Math.random() - 0.5,
    ).normalize();
    const orbitAxis = new THREE.Vector3()
      .crossVectors(normDir, randVec)
      .normalize();

    const baseAltitude = 1.02 + Math.random() * 0.1;
    group.position.copy(normDir).multiplyScalar(baseAltitude);
    group.quaternion.setFromUnitVectors(UP_VEC, normDir);
    this.atmosphereGroup.add(group);

    const entity: BalloonEntity = {
      id: `balloon_${Date.now()}_${Math.random()}`,
      mesh: group,
      burnerMat,
      orbitAxis,
      currentDir: normDir,
      orbitSpeed: 0.065 + Math.random() * 0.03,
      baseAltitude,
      phase: Math.random() * Math.PI * 2,
    };

    if (withSparkles) {
      this.emitSparklesAtDir(normDir, '#ffb8d1', baseAltitude);
    }

    this.balloons.push(entity);
  }

  private spawnShootingStar(dir: THREE.Vector3) {
    const normDir = dir.clone().normalize();
    const mesh = createShootingStarMesh();

    const randVec = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();
    const orbitAxis = new THREE.Vector3()
      .crossVectors(normDir, randVec)
      .normalize();

    const altitude = 1.22;
    mesh.position.copy(normDir).multiplyScalar(altitude);
    this.atmosphereGroup.add(mesh);

    const entity: ShootingStarEntity = {
      id: `star_${Date.now()}_${Math.random()}`,
      mesh,
      orbitAxis,
      currentDir: normDir,
      speed: 1.35,
      altitude,
      age: 0,
      maxAge: 1.65,
      sparkleTimer: 0,
    };

    this.shootingStars.push(entity);
    this.shootingStarGazeTimer = 2.4;
    this.emitSparklesAtDir(normDir, '#fff3a1', altitude);
  }

  private spawnVillager(dir: THREE.Vector3, withSparkles = true) {
    const normDir = dir.clone().normalize();
    const vIdx = this.villagerCounter++;
    const { group, bodyMesh, headGroup, leftLeg, rightLeg, leftArm, rightArm } =
      createVillagerMesh(vIdx);
    const yaw = Math.random() * Math.PI * 2;
    this.orientObjectOnSurface(group, normDir, yaw);
    this.inhabitantsGroup.add(group);

    const headingToWell = vIdx % 4 === 0;
    const targetDir = this.pickNextVillagerTarget(headingToWell, normDir);
    const entity: VillagerEntity = {
      id: `villager_${Date.now()}_${Math.random()}`,
      name: VILLAGER_NAMES[vIdx % VILLAGER_NAMES.length],
      role: VILLAGER_ROLES[vIdx % VILLAGER_ROLES.length],
      assignment: VILLAGER_ASSIGNMENTS[vIdx % VILLAGER_ASSIGNMENTS.length],
      mesh: group,
      bodyMesh,
      headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      dir: normDir,
      targetDir,
      speed: 0.082 + Math.random() * 0.032,
      walkPhase: Math.random() * Math.PI * 2,
      pauseTimer: Math.random() * 1.2,
      headingToWell,
      bounceTime: withSparkles ? 0.0 : 10.0,
      yaw,
      stuckTimer: 0,
      steerSign: vIdx % 2 === 0 ? 1 : -1,
    };

    // Immediately resolve any spawn overlap with buildings or fences
    this.resolveVillagerCollisions(entity, []);
    this.orientObjectOnSurface(entity.mesh, entity.dir, entity.yaw);

    if (withSparkles) {
      this.emitSparklesAtDir(entity.dir, '#ffd180');
    }

    this.villagers.push(entity);
  }

  private sampleClearRingAroundHub(
    hubDir: THREE.Vector3,
    minRingRadius: number,
    maxRingRadius: number,
  ): THREE.Vector3 | null {
    const refUp = Math.abs(hubDir.y) < 0.9 ? UP_VEC : new THREE.Vector3(1, 0, 0);
    const ringRight = new THREE.Vector3().crossVectors(refUp, hubDir).normalize();
    const ringUp = new THREE.Vector3().crossVectors(hubDir, ringRight).normalize();

    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r =
        minRingRadius + Math.random() * Math.max(0.005, maxRingRadius - minRingRadius);
      const candidate = hubDir
        .clone()
        .addScaledVector(ringRight, Math.cos(angle) * r)
        .addScaledVector(ringUp, Math.sin(angle) * r)
        .normalize();
      if (this.isPositionClearOfObstacles(candidate, 0.018)) {
        return candidate;
      }
    }
    return null;
  }

  private pickNextVillagerTarget(
    headingToSocialHub: boolean,
    fromDir?: THREE.Vector3,
  ): THREE.Vector3 {
    const isEveningOrNight = this.timeOfDay > 0.42 && this.timeOfDay < 0.9;
    const campfires = this.placedObjects.filter((o) => o.type === 'campfire');

    // Count how many villagers are already near or heading toward the stone well
    const wellVisitorCount = this.villagers.filter(
      (v) =>
        v.dir.distanceTo(this.wellDirection) < 0.14 ||
        v.targetDir.distanceTo(this.wellDirection) < 0.14,
    ).length;

    if (headingToSocialHub) {
      // 1. At dusk and night, villagers gather around the outside ring of cozy campfires
      if (isEveningOrNight && campfires.length > 0 && Math.random() < 0.75) {
        const sortedFires = fromDir
          ? [...campfires].sort(
              (a, b) => a.dir.distanceTo(fromDir) - b.dir.distanceTo(fromDir),
            )
          : campfires;
        const cf = sortedFires[0];
        const baseR = this.getObjectCollisionRadius('campfire');
        const spot = this.sampleClearRingAroundHub(cf.dir, baseR + 0.026, baseR + 0.044);
        if (spot) return spot;
      }

      // 2. Only allow at most 2 villagers at a time to head to the Stone Well, and only if reasonably nearby
      const nearWellHemisphere = !fromDir || fromDir.distanceTo(this.wellDirection) < 0.85;
      if (wellVisitorCount < 2 && nearWellHemisphere && Math.random() < 0.45) {
        const wellBaseR = this.getObjectCollisionRadius('well');
        const wellSpot = this.sampleClearRingAroundHub(
          this.wellDirection,
          wellBaseR + 0.028,
          wellBaseR + 0.048,
        );
        if (wellSpot) return wellSpot;
      }

      // 3. Otherwise visit one of the other scenic community landmarks across the globe
      const communityHubs = this.placedObjects.filter(
        (o) =>
          o.type === 'campfire' ||
          o.type === 'windmill' ||
          o.type === 'watchtower' ||
          o.type === 'beehive' ||
          o.type === 'dock',
      );
      if (communityHubs.length > 0) {
        const filteredHubs = fromDir
          ? communityHubs.filter((h) => h.dir.distanceTo(fromDir) > 0.08)
          : communityHubs;
        const pool = filteredHubs.length > 0 ? filteredHubs : communityHubs;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        if (
          chosen.type === 'windmill' ||
          chosen.type === 'watchtower' ||
          chosen.type === 'dock'
        ) {
          return this.getBuildingEntranceDir(
            chosen,
            (Math.random() - 0.5) * 0.022,
          );
        }
        const hubR = this.getObjectCollisionRadius(chosen.type);
        const hubSpot = this.sampleClearRingAroundHub(
          chosen.dir,
          hubR + 0.026,
          hubR + 0.044,
        );
        if (hubSpot) return hubSpot;
      }
    }

    // Visit a cottage, watchtower, windmill, or dock around the globe
    const destinations = this.placedObjects.filter(
      (o) =>
        o.type === 'house' ||
        o.type === 'watchtower' ||
        o.type === 'windmill' ||
        o.type === 'dock',
    );
    if (destinations.length > 0) {
      // Exclude the building the villager is currently standing right in front of
      const candidates = fromDir
        ? destinations.filter((d) => d.dir.distanceTo(fromDir) > 0.09)
        : destinations;
      const pool = candidates.length > 0 ? candidates : destinations;

      // 70% of the time pick one of the 4 closest destinations in the villager's region; 30% trek across the globe
      let chosen: PlacedObjectEntity;
      if (fromDir && Math.random() < 0.7 && pool.length > 4) {
        const sorted = [...pool].sort(
          (a, b) => a.dir.distanceTo(fromDir) - b.dir.distanceTo(fromDir),
        );
        const localSlice = sorted.slice(0, 4);
        chosen = localSlice[Math.floor(Math.random() * localSlice.length)];
      } else {
        chosen = pool[Math.floor(Math.random() * pool.length)];
      }

      const lateral = (Math.random() - 0.5) * 0.022;
      // Target the front door threshold / porch outside the building, NEVER the building center!
      return this.getBuildingEntranceDir(chosen, lateral);
    }

    for (let attempt = 0; attempt < 16; attempt++) {
      const candidate = this.wellDirection
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.34,
            (Math.random() - 0.5) * 0.34,
            0,
          ),
        )
        .normalize();
      if (this.isPositionClearOfObstacles(candidate, 0.014)) {
        return candidate;
      }
    }
    return this.wellDirection
      .clone()
      .add(new THREE.Vector3(0, 0.068, 0))
      .normalize();
  }

  private spawnSheep(
    dir: THREE.Vector3,
    withSparkles = true,
    forceInPasture?: boolean,
  ) {
    const normDir = dir.clone().normalize();
    const { group, headGroup, legs, tailMesh } = createSheepMesh();
    const yaw = Math.random() * Math.PI * 2;
    this.orientObjectOnSurface(group, normDir, yaw);
    this.inhabitantsGroup.add(group);

    const isInsideCorral =
      forceInPasture !== undefined
        ? forceInPasture
        : normDir.distanceTo(this.pastureCenter) < this.pastureRadius - 0.01;

    const entity: SheepEntity = {
      id: `sheep_${Date.now()}_${Math.random()}`,
      mesh: group,
      headGroup,
      legs,
      tailMesh,
      dir: normDir,
      targetDir: normDir.clone(),
      speed: 0.04 + Math.random() * 0.018,
      walkPhase: Math.random() * Math.PI * 2,
      grazeTimer: 0.8 + Math.random() * 2.4,
      isGrazing: true,
      bounceTime: withSparkles ? 0.0 : 10.0,
      yaw,
      inPasture: isInsideCorral,
    };

    this.resolveSheepCollisions(entity);
    this.orientObjectOnSurface(entity.mesh, entity.dir, entity.yaw);

    if (withSparkles) {
      this.emitSparklesAtDir(entity.dir, '#ffffff');
    }

    this.sheepList.push(entity);
  }

  private spawnCloud(
    dir: THREE.Vector3,
    withSparkles = true,
    initialRainTimer = 4.0,
    isSnow = false,
  ) {
    const normDir = dir.clone().normalize();
    const { group, rainLines, rainMat, snowPoints, snowMat } =
      createPuffyCloudMesh(isSnow);

    // Pick an orbital axis perpendicular to initial direction
    const randVec = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() + 0.4,
      Math.random() - 0.5,
    ).normalize();
    const orbitAxis = new THREE.Vector3()
      .crossVectors(normDir, randVec)
      .normalize();

    const altitude = 1.09 + Math.random() * 0.07; // Suspended inside the 1.50 glass orb above 0.75 planet
    group.position.copy(normDir).multiplyScalar(altitude);
    group.quaternion.setFromUnitVectors(UP_VEC, normDir);
    this.atmosphereGroup.add(group);

    const entity: CloudEntity = {
      id: `cloud_${Date.now()}_${Math.random()}`,
      isSnow,
      mesh: group,
      rainLines,
      rainMat,
      snowPoints,
      snowMat,
      orbitAxis,
      currentDir: normDir,
      orbitSpeed: 0.11 + Math.random() * 0.05,
      altitude,
      rainTimer: initialRainTimer,
      isRaining: isSnow, // Snow clouds begin gently snowing right away
      bounceTime: withSparkles ? 0.0 : 10.0,
    };

    if (withSparkles) {
      this.emitSparklesAtDir(normDir, isSnow ? '#ffffff' : '#cce8ff', altitude);
    }

    this.clouds.push(entity);
  }

  public emitSparklesAtDir(
    dir: THREE.Vector3,
    hexColor = '#ffe57f',
    customRadius?: number,
  ) {
    const surface = this.terrain.getSurfacePointAndNormal(dir);
    const origin = customRadius
      ? dir.clone().normalize().multiplyScalar(customRadius)
      : surface.point.clone().addScaledVector(surface.normal, 0.025);

    const count = 18;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    const baseCol = new THREE.Color(hexColor);
    const altCol = new THREE.Color('#ffffff');

    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      const c = i % 2 === 0 ? baseCol : altCol;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
      );
      const vel = surface.normal
        .clone()
        .multiplyScalar(0.12 + Math.random() * 0.14)
        .addScaledVector(spread, 0.09);
      velocities.push(vel);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.032,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    this.effectsGroup.add(points);
    this.sparkles.push({
      points,
      velocities,
      age: 0,
      maxAge: 0.75,
    });
  }

  private realignAllObjectsToTerrain() {
    for (const obj of this.placedObjects) {
      const stickToSea = obj.type === 'dock' || obj.type === 'bridge';
      const useRadialUp = stickToSea || obj.type === 'lighthouse';
      this.orientObjectOnSurface(obj.mesh, obj.dir, obj.yaw, 0, stickToSea, useRadialUp);
    }
  }

  private showStatusMessage(msg: string, durationMs = 3400) {
    this.statusMessage = msg;
    if (this.statusMessageTimer !== null) {
      window.clearTimeout(this.statusMessageTimer);
    }
    this.onStateChange((prev) => ({ ...prev, statusMessage: msg }));
    this.statusMessageTimer = window.setTimeout(() => {
      this.statusMessage = null;
      this.statusMessageTimer = null;
      this.onStateChange((prev) => ({ ...prev, statusMessage: null }));
    }, durationMs);
  }

  public getCurrentProgressionTier(): ProgressionTierId {
    let current: ProgressionTierId = 'first_sprouts';
    for (const tier of PROGRESSION_TIERS) {
      if (this.gardenPoints >= tier.requiredPoints) {
        current = tier.id;
      }
    }
    return current;
  }

  public isTierUnlocked(requiredTier?: ProgressionTierId): boolean {
    if (!requiredTier) return true;
    const order: ProgressionTierId[] = [
      'first_sprouts',
      'kitchen_garden',
      'village_farm',
      'flourishing_terrarium',
    ];
    const curIdx = order.indexOf(this.getCurrentProgressionTier());
    const reqIdx = order.indexOf(requiredTier);
    return curIdx >= reqIdx;
  }

  public isToolUnlocked(toolId: ToolId): boolean {
    const def = TOOL_DEFINITIONS.find((t) => t.id === toolId);
    if (!def || !def.requiredTier) return true;
    return this.isTierUnlocked(def.requiredTier);
  }

  private spendCoins(amount: number, reasonLabel: string): boolean {
    if (amount <= 0) return true;
    if (this.coins < amount) {
      this.showStatusMessage(
        `Need ${amount} Coins for ${reasonLabel} (have ${this.coins} Coins)`,
      );
      return false;
    }
    this.coins -= amount;
    return true;
  }

  private syncCanopyEmitters() {
    if (!this.pixelFx) return;
    const oakAnchors: THREE.Vector3[] = [];
    for (const obj of this.placedObjects) {
      if (obj.type === 'oak') {
        const surf = this.terrain.getSurfacePointAndNormal(obj.dir);
        oakAnchors.push(
          surf.point.clone().addScaledVector(surf.normal, 0.055),
        );
      }
    }
    this.pixelFx.syncTreeCanopies(oakAnchors);
  }

  public handleSurfaceAction(localDir: THREE.Vector3) {
    const surface = this.terrain.getSurfacePointAndNormal(localDir);
    const tool = this.activeTool;

    // 0. If no tool is active (Default Inspect / Select mode), select or deselect entity
    if (!tool) {
      this.selectEntityAtDirection(localDir);
      return;
    }

    if (!this.isToolUnlocked(tool)) {
      const def = TOOL_DEFINITIONS.find((t) => t.id === tool);
      const tierInfo = PROGRESSION_TIERS.find(
        (tr) => tr.id === def?.requiredTier,
      );
      this.showStatusMessage(
        `Unlocks at ${tierInfo?.label || 'next tier'} (${tierInfo?.requiredPoints || 0} Garden Points)`,
      );
      return;
    }

    // 1A. PREPARE SOIL BED
    if (tool === 'prepare_bed') {
      if (surface.isWater || surface.isMountain || surface.normal.dot(localDir) < 0.78) {
        this.showStatusMessage(
          'Choose a gentle, dry meadow spot to prepare a soil bed',
        );
        return;
      }
      const existingPlot = this.findNearestPlot(localDir, 0.088);
      if (existingPlot) {
        this.selectedEntityId = existingPlot.id;
        this.showStatusMessage('A garden bed is already prepared here');
        this.syncWorldStats();
        return;
      }
      if (!this.isPositionClearOfObstacles(localDir, 0.024)) {
        this.showStatusMessage('Clear a little more room around buildings and trees');
        return;
      }
      const cost = BUILDING_COSTS.prepare_bed || 4;
      if (!this.spendCoins(cost, 'preparing a soil bed')) {
        return;
      }
      this.terrain.tillAtDirection(localDir, 0.055);
      const yaw = this.computeYawFacingTarget(localDir, this.wellDirection);
      const newPlot = this.placeGardenPlot(
        'berry',
        localDir,
        yaw,
        0.0,
        0.62,
        false,
        true,
        { hasCrop: false, harvested: false },
      );
      soundEngine.playPlant();
      this.selectedEntityId = newPlot.id;
      this.showStatusMessage('Prepared a fresh soil bed — select seeds to sow');
      this.syncWorldStats();
      return;
    }

    // 1B. PLANT / SOW Seeds (Wheat, Pumpkin, Berry)
    if (
      tool === 'wheat_seed' ||
      tool === 'pumpkin_seed' ||
      tool === 'berry_seed'
    ) {
      const cropType: CropType =
        tool === 'wheat_seed'
          ? 'wheat'
          : tool === 'pumpkin_seed'
            ? 'pumpkin'
            : 'berry';

      const cropCfg = CROP_CONFIGS[cropType];
      if (!this.isTierUnlocked(cropCfg.unlockTier)) {
        this.showStatusMessage(`${cropCfg.label} unlocks at Kitchen Garden tier`);
        return;
      }

      // Check if clicking on an existing plot to sow or replant it
      const existingPlot = this.findNearestPlot(localDir, 0.095);
      if (existingPlot) {
        this.replantPlot(existingPlot.id, cropType);
        return;
      }

      // Do not automatically raise water when sowing seeds!
      if (surface.isWater || surface.isMountain || surface.normal.dot(localDir) < 0.78) {
        this.showStatusMessage(
          'Seeds need dry, level ground or a prepared soil bed',
        );
        return;
      }
      if (!this.isPositionClearOfObstacles(localDir, 0.024)) {
        this.showStatusMessage('Not enough space between nearby structures');
        return;
      }

      if ((this.seedsByCrop[cropType] || 0) < 1) {
        this.showStatusMessage(
          `No ${cropCfg.label} seeds left — buy seeds in the Inventory menu`,
        );
        return;
      }

      // Preparing a new bed + sowing on open ground costs bed preparation coins (unless player has 0 plots)
      const plotCount = this.placedObjects.filter((o) => o.type === 'plot').length;
      const bedCost = plotCount === 0 ? 0 : BUILDING_COSTS.prepare_bed || 4;
      if (bedCost > 0 && !this.spendCoins(bedCost, 'new garden bed')) {
        return;
      }

      this.seedsByCrop[cropType] -= 1;
      this.terrain.tillAtDirection(localDir, 0.055);
      const yaw = this.computeYawFacingTarget(localDir, this.wellDirection);
      const newPlot = this.placeGardenPlot(
        cropType,
        localDir,
        yaw,
        0.02, // Starts in 'sown' stage
        0.58,
        false,
        true,
        { hasCrop: true, harvested: false },
      );
      this.stats.totalPlanted += 1;
      soundEngine.playPlant();
      this.selectedEntityId = newPlot.id;
      this.syncWorldStats();
      return;
    }

    // 2. TEND tools: Watering Can, Rich Compost & Glass Cloche
    if (tool === 'water_can') {
      const targetPlot = this.findNearestPlot(localDir, 0.15);
      if (targetPlot) {
        this.waterPlot(targetPlot.id);
        return;
      }
      if (this.resources.water < 1) {
        this.showStatusMessage(
          'Watering can is empty — refill at the Stone Well',
        );
        return;
      }
      this.resources.water -= 1;
      this.terrain.applyRainAtDirection(localDir, 0.45);
      this.pixelFx.spawnRipple(surface.point, surface.normal, 'soil');
      for (const obj of this.placedObjects) {
        if (
          (obj.type === 'oak' || obj.type === 'pine' || obj.type === 'palm') &&
          obj.dir.distanceTo(localDir) < 0.22
        ) {
          obj.targetGrowth = Math.min(1.38, obj.targetGrowth + 0.12);
          obj.bounceTime = 0;
          obj.bounceActive = !this.reducedMotion;
        }
      }
      soundEngine.playWater();
      this.stats.totalTended += 1;
      this.syncWorldStats();
      return;
    }

    if (tool === 'compost') {
      const targetPlot = this.findNearestPlot(localDir, 0.15);
      if (targetPlot) {
        this.compostPlot(targetPlot.id);
      } else {
        this.showStatusMessage('Click directly on a garden bed to enrich its soil');
      }
      return;
    }

    if (tool === 'greenhouse_bell') {
      const targetPlot = this.findNearestPlot(localDir, 0.15);
      if (targetPlot) {
        this.installClocheOnPlot(targetPlot.id);
      } else {
        this.showStatusMessage(
          'Click a garden bed to fit a protective glass cloche over it',
        );
      }
      return;
    }

    // 3. HARVEST tools: Harvest Basket & Gather All
    if (tool === 'harvest_basket') {
      const targetPlot = this.findNearestPlot(localDir, 0.15);
      if (targetPlot) {
        this.harvestPlot(targetPlot.id);
        return;
      }
      const hive = this.placedObjects.find(
        (o) => o.type === 'beehive' && o.dir.distanceTo(localDir) < 0.15,
      );
      if (hive) {
        this.performBuildingAction(hive.id);
        return;
      }
      const mill = this.placedObjects.find(
        (o) => o.type === 'windmill' && o.dir.distanceTo(localDir) < 0.15,
      );
      if (mill) {
        this.performBuildingAction(mill.id);
        return;
      }
      this.showStatusMessage('Click a ripe crop plot, beehive, or windmill to collect');
      return;
    }

    if (tool === 'harvest_all') {
      this.harvestAllRipe();
      return;
    }

    if (tool === 'raise' || tool === 'lower' || tool === 'mountain' || tool === 'lake') {
      const cost = BUILDING_COSTS[tool] || 0;
      if (cost > 0 && !this.spendCoins(cost, 'terrain shaping')) {
        return;
      }
      this.terrain.sculptAtDirection(localDir, tool);
      this.realignAllObjectsToTerrain();
      this.emitSparklesAtDir(
        localDir,
        tool === 'lake' || tool === 'lower' ? '#7ef2e6' : '#c9f29b',
      );
      soundEngine.playBuild();
      this.syncWorldStats();
      return;
    }

    if (tool === 'remove') {
      let bestIdx = -1;
      let bestDist = 0.15;
      for (let i = 0; i < this.placedObjects.length; i++) {
        const o = this.placedObjects[i];
        if (!o.removable) continue;
        const d = o.dir.distanceTo(localDir);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        const removed = this.placedObjects.splice(bestIdx, 1)[0];
        this.objectsGroup.remove(removed.mesh);
        if (this.selectedEntityId === removed.id) {
          this.selectedEntityId = null;
          this.selectionRing.visible = false;
        }
        if (removed.type === 'oak') {
          this.syncCanopyEmitters();
        }
        this.emitSparklesAtDir(removed.dir, '#ffb8b8');
        soundEngine.playSelect();
        this.syncWorldStats();
        return;
      }

      for (let i = 0; i < this.sailboats.length; i++) {
        if (this.sailboats[i].dir.distanceTo(localDir) < 0.18) {
          const removed = this.sailboats.splice(i, 1)[0];
          this.inhabitantsGroup.remove(removed.mesh);
          this.emitSparklesAtDir(removed.dir, '#ffb8b8', this.terrain.seaLevel);
          this.syncWorldStats();
          return;
        }
      }
      return;
    }

    // Weather & Sky tools
    if (tool === 'cloud') {
      this.spawnCloud(localDir, true, 1.0, false);
      soundEngine.playWater();
      this.syncWorldStats();
      return;
    }
    if (tool === 'snowcloud') {
      this.spawnCloud(localDir, true, 0.2, true);
      soundEngine.playWater();
      this.syncWorldStats();
      return;
    }
    if (tool === 'balloon') {
      this.spawnBalloon(localDir, true);
      soundEngine.playBuild();
      this.syncWorldStats();
      return;
    }
    if (tool === 'shootingstar') {
      this.spawnShootingStar(localDir);
      soundEngine.playHarvest();
      this.syncWorldStats();
      return;
    }
    if (tool === 'rainbow') {
      const yaw = this.findCollisionFreeRainbowYaw(localDir);
      this.placeStaticObject('rainbow', localDir, yaw, true, true);
      soundEngine.playHarvest();
      this.syncWorldStats();
      return;
    }

    // Water & Coastal tools
    if (tool === 'sailboat') {
      const cost = BUILDING_COSTS.sailboat || 16;
      if (!this.spendCoins(cost, 'Wooden Sailboat')) return;
      this.spawnSailboat(localDir, true);
      const boat = this.sailboats[this.sailboats.length - 1];
      if (boat) {
        const boatPt = boat.dir.clone().multiplyScalar(this.terrain.seaLevel);
        this.pixelFx.spawnRipple(boatPt, boat.dir, 'boat');
      }
      soundEngine.playBuild();
      this.syncWorldStats();
      return;
    }
    if (tool === 'duck') {
      this.spawnDuckFlock(localDir, true);
      soundEngine.playWater();
      this.syncWorldStats();
      return;
    }
    if (tool === 'dock') {
      const cost = BUILDING_COSTS.dock || 24;
      if (!this.spendCoins(cost, 'Timber Pier')) return;
      if (surface.isWater) {
        this.placeStaticObject(
          'bridge',
          localDir,
          Math.random() * Math.PI * 2,
          true,
          true,
        );
      } else {
        const nearestWater = this.terrain.findNearestWaterDirection(localDir, 0.55);
        let yaw = Math.random() * Math.PI * 2;
        if (nearestWater) {
          const tangent = nearestWater
            .clone()
            .sub(localDir)
            .projectOnPlane(surface.normal)
            .normalize();
          yaw = Math.atan2(tangent.x, tangent.z);
        }
        this.placeStaticObject('dock', localDir, yaw, true, true);
      }
      soundEngine.playBuild();
      this.syncWorldStats();
      return;
    }

    // Validate dry land for land-based structures & trees
    if (surface.isWater || surface.isMountain) {
      this.showStatusMessage('Place land structures on dry meadow or hillside');
      return;
    }
    if (!this.isPositionClearOfObstacles(localDir, 0.02)) {
      this.showStatusMessage('Too close to an existing structure or tree');
      return;
    }

    const toolCost = BUILDING_COSTS[tool] || 0;
    if (toolCost > 0) {
      const def = TOOL_DEFINITIONS.find((t) => t.id === tool);
      if (!this.spendCoins(toolCost, def?.label || tool)) {
        return;
      }
    }

    if (tool === 'tree') {
      let treeType: PlacedObjectType = 'oak';
      if (surface.isBeach) {
        treeType = 'palm';
      } else if (surface.isMountain || localDir.y > 0.58) {
        treeType = 'pine';
      }
      this.placeStaticObject(treeType, localDir, Math.random() * Math.PI * 2, true, true);
      this.stats.totalPlanted += 1;
      soundEngine.playPlant();
    } else if (tool === 'house') {
      const houseYaw = this.computeYawFacingTarget(localDir, this.wellDirection);
      const newHouse = this.placeStaticObject('house', localDir, houseYaw, true, true);
      const doorDir = this.getBuildingEntranceDir(newHouse, 0);
      if (localDir.distanceTo(this.wellDirection) < 0.55) {
        const pathDir = doorDir.clone().lerp(this.wellDirection, 0.5).normalize();
        const pathYaw = this.computeYawFacingTarget(pathDir, this.wellDirection);
        this.placeStaticObject('path', pathDir, pathYaw, true, false);
      }
      this.spawnVillager(this.getBuildingEntranceDir(newHouse, -0.014), false);
      this.spawnVillager(this.getBuildingEntranceDir(newHouse, 0.014), false);
      soundEngine.playBuild();
    } else if (tool === 'windmill') {
      const yaw = this.computeYawFacingTarget(localDir, this.wellDirection);
      this.placeStaticObject('windmill', localDir, yaw, true, true);
      soundEngine.playBuild();
    } else if (tool === 'lighthouse') {
      this.placeStaticObject('lighthouse', localDir, Math.random() * Math.PI * 2, true, true);
      soundEngine.playBuild();
    } else if (tool === 'watchtower') {
      const yaw = this.computeYawFacingTarget(localDir, this.wellDirection);
      this.placeStaticObject('watchtower', localDir, yaw, true, true);
      soundEngine.playBuild();
    } else if (tool === 'campfire') {
      this.placeStaticObject('campfire', localDir, Math.random() * Math.PI * 2, true, true);
      soundEngine.playBuild();
    } else if (tool === 'beehive') {
      this.placeStaticObject('beehive', localDir, Math.random() * Math.PI * 2, true, true);
      const blossomDir = localDir
        .clone()
        .add(new THREE.Vector3(0.035, 0.02, -0.02))
        .normalize();
      if (!this.terrain.getSurfacePointAndNormal(blossomDir).isWater) {
        this.placeStaticObject('flower', blossomDir, Math.random() * Math.PI * 2, true, false);
      }
      this.stats.totalTended += 1;
      soundEngine.playPlant();
    } else if (tool === 'lantern') {
      this.placeStaticObject('lantern', localDir, Math.random() * Math.PI * 2, true, true);
      soundEngine.playBuild();
    } else if (tool === 'flower') {
      this.placeStaticObject('flower', localDir, Math.random() * Math.PI * 2, true, true);
      this.stats.totalPlanted += 1;
      soundEngine.playPlant();
    } else if (tool === 'villager') {
      this.spawnVillager(localDir, true);
      soundEngine.playBuild();
    } else if (tool === 'sheep') {
      this.spawnSheep(localDir, true);
      this.stats.totalTended += 1;
      soundEngine.playPlant();
    }

    const bridgesAndDocks = this.placedObjects.filter(
      (o) => o.type === 'bridge' || o.type === 'dock',
    );
    for (const v of this.villagers) {
      this.resolveVillagerCollisions(v, bridgesAndDocks);
    }
    for (const s of this.sheepList) {
      this.resolveSheepCollisions(s);
    }

    this.syncWorldStats();
  }

  private findNearestPlot(
    localDir: THREE.Vector3,
    maxDist = 0.14,
  ): PlacedObjectEntity | null {
    let best: PlacedObjectEntity | null = null;
    let bestD = maxDist;
    for (const obj of this.placedObjects) {
      if (obj.type !== 'plot') continue;
      const d = obj.dir.distanceTo(localDir);
      if (d < bestD) {
        bestD = d;
        best = obj;
      }
    }
    return best;
  }

  public selectEntityAtDirection(localDir: THREE.Vector3) {
    let bestId: string | null = null;
    let bestDist = 0.11;

    for (const obj of this.placedObjects) {
      if (obj.type === 'plot') {
        const d = obj.dir.distanceTo(localDir);
        if (d < bestDist) {
          bestDist = d;
          bestId = obj.id;
        }
      }
    }

    if (!bestId) {
      let bestVDist = 0.095;
      for (const v of this.villagers) {
        const d = v.dir.distanceTo(localDir);
        if (d < bestVDist) {
          bestVDist = d;
          bestId = v.id;
        }
      }
    }

    if (!bestId) {
      let bestBDist = 0.125;
      const selectableBuildings: PlacedObjectType[] = [
        'house',
        'windmill',
        'lighthouse',
        'watchtower',
        'beehive',
        'campfire',
        'dock',
        'bridge',
        'well',
        'lantern',
      ];
      for (const obj of this.placedObjects) {
        if (!selectableBuildings.includes(obj.type)) continue;
        const d = obj.dir.distanceTo(localDir);
        if (d < bestBDist) {
          bestBDist = d;
          bestId = obj.id;
        }
      }
    }

    if (bestId) {
      this.selectedEntityId = bestId;
      soundEngine.playSelect();
    } else {
      this.selectedEntityId = null;
      this.selectionRing.visible = false;
    }
    this.syncWorldStats();
  }

  public clearSelection() {
    this.selectedEntityId = null;
    this.selectionRing.visible = false;
    this.syncWorldStats();
  }

  private getEffectiveWeather(): WeatherPhase {
    return this.weatherOverride ?? this.weatherPhase;
  }

  private buildSelectedEntityInfo(): SelectedEntityInfo | null {
    if (!this.selectedEntityId) return null;

    const obj = this.placedObjects.find((o) => o.id === this.selectedEntityId);
    if (obj) {
      if (obj.type === 'plot') {
        const cropType = obj.cropType || 'wheat';
        const hasCrop = obj.hasCrop ?? true;
        const lifecycleState = this.getPlotLifecycle(obj);
        const cropLabel =
          lifecycleState === 'prepared'
            ? 'Prepared Soil'
            : lifecycleState === 'harvested'
              ? 'Harvested Soil'
              : CROP_CONFIGS[cropType].label;
        const g = THREE.MathUtils.clamp(obj.growth, 0, 1);
        const growthPct = hasCrop ? Math.round(g * 100) : 0;

        const stageMap: Record<PlotLifecycleState, string> = {
          prepared: 'Prepared Bed',
          sown: 'Sown Seeds',
          seedling: 'Seedling',
          growing: 'Growing',
          ripe: 'Ripe & Ready',
          harvested: 'Harvested Bed',
        };

        const moisturePct = Math.round((obj.moisture ?? 0.5) * 100);
        const pollinated = this.placedObjects.some(
          (h) => h.type === 'beehive' && h.dir.distanceTo(obj.dir) < 0.35,
        );
        const isColdWeather =
          this.getEffectiveWeather() === 'snow' || this.season === 'winter';
        const pausedByCold = hasCrop && isColdWeather && !obj.hasCloche;

        const reservedVil = obj.reservedByVillagerId
          ? this.villagers.find((v) => v.id === obj.reservedByVillagerId)
          : undefined;

        return {
          kind: 'plot',
          id: obj.id,
          cropType,
          cropLabel,
          hasCrop,
          lifecycleState,
          stage: stageMap[lifecycleState],
          growthPct,
          moisturePct,
          composted: Boolean(obj.composted),
          pollinated,
          hasCloche: Boolean(obj.hasCloche),
          pausedByCold,
          reservedByVillagerName: reservedVil?.name,
        };
      }

      // Building contextual metadata with live production state
      if (obj.type === 'windmill') {
        const stored = obj.storedOutput || 0;
        const isProc = Boolean(obj.isProcessing);
        const progPct = isProc
          ? Math.min(
              100,
              Math.round(
                ((obj.productionTimer || 0) /
                  PRODUCTION_CONFIG.windmill.processDurationSec) *
                  100,
              ),
            )
          : 0;
        const subtitle = isProc
          ? `Milling Grain (${progPct}%) · Stored: ${stored}/${PRODUCTION_CONFIG.windmill.maxStorage} Flour`
          : `Granary Mill · Stored: ${stored}/${PRODUCTION_CONFIG.windmill.maxStorage} Flour (Have ${this.inventory.wheat} Wheat)`;
        const actionLabel =
          stored > 0
            ? `Collect +${stored} Flour`
            : isProc
              ? `Milling (${progPct}%)`
              : 'Mill 2 Wheat → 1 Flour';
        const canPerform =
          stored > 0 ||
          (!isProc &&
            this.inventory.wheat >= PRODUCTION_CONFIG.windmill.wheatInput &&
            stored < PRODUCTION_CONFIG.windmill.maxStorage);

        return {
          kind: 'building',
          id: obj.id,
          buildingType: obj.type,
          title: 'Millstone Grain Windmill',
          subtitle,
          harmonyBonus: '40s Grain Processing',
          actionLabel,
          actionDescription: 'Grinds 2 harvested Wheat into 1 artisan Flour over 40s',
          canPerformAction: canPerform,
          productionProgress: isProc ? progPct : undefined,
          storedOutput: stored,
          maxStorage: PRODUCTION_CONFIG.windmill.maxStorage,
          removable: obj.removable,
        };
      }

      if (obj.type === 'beehive') {
        const stored = obj.storedOutput || 0;
        const nearbyFlowers = this.placedObjects.filter(
          (f) => f.type === 'flower' && f.dir.distanceTo(obj.dir) < 0.28,
        ).length;
        const progPct =
          stored >= PRODUCTION_CONFIG.beehive.maxStorage
            ? 100
            : Math.min(
                100,
                Math.round(
                  ((obj.productionTimer || 0) /
                    PRODUCTION_CONFIG.beehive.baseDurationSec) *
                    100,
                ),
              );
        const subtitle = `Stored: ${stored}/${PRODUCTION_CONFIG.beehive.maxStorage} Honey · Next Jar ${progPct}% (${nearbyFlowers} Wildflowers nearby)`;
        const actionLabel =
          stored > 0 ? `Collect +${stored} Honey` : `Gathering Nectar (${progPct}%)`;

        return {
          kind: 'building',
          id: obj.id,
          buildingType: obj.type,
          title: 'Painted Meadow Apiary',
          subtitle,
          harmonyBonus: '+18% Nearby Crop Growth',
          actionLabel,
          actionDescription: 'Bees gather wildflower nectar into golden honey jars',
          canPerformAction: stored > 0,
          productionProgress:
            stored < PRODUCTION_CONFIG.beehive.maxStorage ? progPct : undefined,
          storedOutput: stored,
          maxStorage: PRODUCTION_CONFIG.beehive.maxStorage,
          removable: obj.removable,
        };
      }

      if (obj.type === 'well') {
        const needsWater = this.resources.water < PRODUCTION_CONFIG.well.maxWater;
        return {
          kind: 'building',
          id: obj.id,
          buildingType: obj.type,
          title: 'Little Meadow Stone Well',
          subtitle: `Watering Can: ${this.resources.water}/${PRODUCTION_CONFIG.well.maxWater} Water`,
          harmonyBonus: 'Fresh Spring Water',
          actionLabel: needsWater ? 'Refill Watering Can (20/20)' : 'Watering Can Full',
          actionDescription: 'Draw cool spring water to hydrate garden beds',
          canPerformAction: needsWater,
          removable: obj.removable,
        };
      }

      if (obj.type === 'dock') {
        const hasGoods =
          this.inventory.flour > 0 ||
          this.inventory.honey > 0 ||
          this.inventory.pumpkin > 0 ||
          this.inventory.wheat > 0 ||
          this.inventory.berry > 0;
        return {
          kind: 'building',
          id: obj.id,
          buildingType: obj.type,
          title: 'Timber Shoreline Pier',
          subtitle: hasGoods
            ? 'Coastal Merchant Ready · Trade Pantry Goods for Coins & Compost'
            : 'Harbor Mooring · Gather produce or goods to trade with passing boats',
          harmonyBonus: 'Harbor Trade',
          actionLabel: hasGoods ? 'Trade Goods (+Coins & +1 Compost)' : 'Ring Harbor Bell',
          actionDescription: 'Exchange pantry goods with coastal traders',
          canPerformAction: true,
          removable: obj.removable,
        };
      }

      const buildingMeta: Record<
        string,
        {
          title: string;
          subtitle: string;
          harmonyBonus: string;
          actionLabel: string;
          actionDescription: string;
        }
      > = {
        house: {
          title: obj.customTitle || 'Pastel Meadow Cottage',
          subtitle: 'Cozy Timber-Frame Home · 2 Residents',
          harmonyBonus: '+2 Village Harmony',
          actionLabel: 'Ring Hearth Bell',
          actionDescription: 'Invite residents outside to greet the village',
        },
        lighthouse: {
          title: 'Coastal Beacon Lighthouse',
          subtitle: 'Guides Sailboats Across Turquoise Seas',
          harmonyBonus: '+2 Coastal Harmony',
          actionLabel: 'Sweep Lantern Beam',
          actionDescription: 'Send a warm guiding light pulse across the sea',
        },
        watchtower: {
          title: 'Fairytale Stone Keep',
          subtitle: 'Scenic Highland Overlook',
          harmonyBonus: '+2 Village Harmony',
          actionLabel: 'Sound Horn Call',
          actionDescription: 'Invite nearby villagers to visit the overlook',
        },
        campfire: {
          title: 'Stone Hearth Campfire',
          subtitle: 'Evening Gathering Circle',
          harmonyBonus: '+2 Cozy Warmth',
          actionLabel: 'Stoke Warm Embers',
          actionDescription: 'Send warm sparks skyward & invite villagers near',
        },
        bridge: {
          title: 'Arched Footbridge',
          subtitle: 'Connects Meadow Shores Across Water',
          harmonyBonus: '+1.5 Village Harmony',
          actionLabel: 'Ripple Stream Below',
          actionDescription: 'Drop a pebble to watch concentric ripples in the stream',
        },
        lantern: {
          title: 'Wrought-Iron Lantern Post',
          subtitle: 'Illuminates Cobblestone Paths at Dusk',
          harmonyBonus: '+1 Nighttime Comfort',
          actionLabel: 'Kindle Warm Glow',
          actionDescription: 'Brighten the streetlamp and nearby path',
        },
      };

      const meta = buildingMeta[obj.type] || {
        title: 'Meadow Landmark',
        subtitle: 'Handcrafted Structure',
        harmonyBonus: '+1 Harmony',
        actionLabel: 'Inspect Landmark',
        actionDescription: 'Admire the miniature craftsmanship',
      };

      return {
        kind: 'building',
        id: obj.id,
        buildingType: obj.type,
        title: meta.title,
        subtitle: meta.subtitle,
        harmonyBonus: meta.harmonyBonus,
        actionLabel: meta.actionLabel,
        actionDescription: meta.actionDescription,
        canPerformAction: true,
        removable: obj.removable,
      };
    }

    // 2. Check Villagers (Live task status instead of static role text)
    const villager = this.villagers.find((v) => v.id === this.selectedEntityId);
    if (villager) {
      const activity =
        villager.liveActivityLabel ||
        (villager.pauseTimer > 0
          ? `Resting near ${villager.assignment}`
          : `Strolling through ${villager.assignment}`);

      return {
        kind: 'villager',
        id: villager.id,
        name: villager.name,
        role: villager.role,
        assignment: villager.assignment,
        activity,
      };
    }

    return null;
  }

  /**
   * Waters a garden plot. Only increases soil moisture (no instant growth boost).
   */
  public waterPlot(plotId: string, byVillager = false): boolean {
    const plot = this.placedObjects.find(
      (o) => o.id === plotId && o.type === 'plot',
    );
    if (!plot) return false;

    if (!byVillager && this.resources.water < 1) {
      this.showStatusMessage(
        'Watering can is empty — refill at the Stone Well',
      );
      return false;
    }

    const curMoisture = plot.moisture ?? 0.5;
    if (!byVillager && curMoisture >= 0.96) {
      this.showStatusMessage('This soil bed is already well-hydrated');
      return false;
    }

    if (!byVillager) {
      this.resources.water = Math.max(0, this.resources.water - 1);
      this.stats.totalTended += 1;
    }

    plot.moisture = Math.min(1.0, curMoisture + 0.55);
    plot.bounceTime = 0;
    plot.bounceActive = !this.reducedMotion;
    this.updatePlotVisuals(plot);

    const surf = this.terrain.getSurfacePointAndNormal(plot.dir);
    this.pixelFx.spawnRipple(surf.point, surf.normal, 'soil');
    soundEngine.playWater();
    this.ambientAudio.playCue('water');
    this.syncWorldStats();
    return true;
  }

  /**
   * Enriches a plot with compost (+25% subsequent growth speed & +1 bonus yield).
   * Does not add instant growth.
   */
  public compostPlot(plotId: string): boolean {
    if (!this.isTierUnlocked('kitchen_garden')) {
      this.showStatusMessage('Rich Compost unlocks at Kitchen Garden tier');
      return false;
    }
    const plot = this.placedObjects.find(
      (o) => o.id === plotId && o.type === 'plot',
    );
    if (!plot) return false;

    if (plot.composted) {
      this.showStatusMessage('This garden bed is already enriched with compost');
      return false;
    }
    if (this.resources.compost < 1) {
      this.showStatusMessage(
        'No compost left — craft compost from produce in Inventory',
      );
      return false;
    }

    this.resources.compost -= 1;
    plot.composted = true;
    plot.bounceTime = 0;
    plot.bounceActive = !this.reducedMotion;
    this.updatePlotVisuals(plot);
    this.emitSparklesAtDir(plot.dir, '#ffd56b');
    this.stats.totalTended += 1;
    soundEngine.playPlant();
    this.syncWorldStats();
    return true;
  }

  /**
   * Fits a protective miniature glass cloche over a plot so crops keep growing in winter/snow.
   */
  public installClocheOnPlot(plotId: string): boolean {
    if (!this.isTierUnlocked('flourishing_terrarium')) {
      this.showStatusMessage(
        'Glass Cloche unlocks at Flourishing Terrarium tier (110 Garden Points)',
      );
      return false;
    }
    const plot = this.placedObjects.find(
      (o) => o.id === plotId && o.type === 'plot',
    );
    if (!plot) return false;
    if (plot.hasCloche) {
      this.showStatusMessage('This plot is already protected by a glass cloche');
      return false;
    }
    const cost = BUILDING_COSTS.greenhouse_bell || 14;
    if (!this.spendCoins(cost, 'Glass Cloche')) {
      return false;
    }
    plot.hasCloche = true;
    plot.bounceTime = 0;
    plot.bounceActive = !this.reducedMotion;
    this.updatePlotVisuals(plot);
    this.emitSparklesAtDir(plot.dir, '#b8f2ff');
    soundEngine.playBuild();
    this.showStatusMessage('Fitted a glass cloche — protected from winter snow');
    this.syncWorldStats();
    return true;
  }

  /**
   * Harvests a single ripe plot. Rejects unripe/empty plots and transitions bed to 'harvested'
   * (unless auto-replant is unlocked and enabled with available seeds).
   */
  public harvestPlot(plotId: string): boolean {
    const plot = this.placedObjects.find(
      (o) => o.id === plotId && o.type === 'plot',
    );
    if (!plot) return false;

    const state = this.getPlotLifecycle(plot);
    if (state !== 'ripe') {
      if (state === 'prepared' || state === 'harvested') {
        this.showStatusMessage('This soil bed is empty — sow seeds first');
      } else {
        this.showStatusMessage(
          `Still growing (${Math.round(plot.growth * 100)}%) — wait until ripe to harvest`,
        );
      }
      return false;
    }

    const pollinated = this.placedObjects.some(
      (h) => h.type === 'beehive' && h.dir.distanceTo(plot.dir) < 0.35,
    );
    const crop = plot.cropType || 'wheat';
    const cfg = CROP_CONFIGS[crop];
    const yieldAmount =
      cfg.baseYield +
      (plot.composted ? cfg.compostBonusYield : 0) +
      (pollinated ? 1 : 0);

    if (crop === 'wheat') {
      this.inventory.wheat += yieldAmount;
    } else if (crop === 'pumpkin') {
      this.inventory.pumpkin += yieldAmount;
    } else {
      this.inventory.berry += yieldAmount;
    }

    this.resources.harvestTotal += yieldAmount;
    this.stats.totalHarvested += yieldAmount;

    // Award Garden Points (+bonus on first discovery of a crop)
    let gpGain = cfg.gardenPointsOnHarvest;
    if (!this.discoveredCrops.has(crop)) {
      this.discoveredCrops.add(crop);
      gpGain += 3;
    }
    this.gardenPoints += gpGain;

    // Check if auto-replant is unlocked, enabled, and has a seed available
    if (
      this.autoReplantEnabled &&
      this.isTierUnlocked('flourishing_terrarium') &&
      (this.seedsByCrop[crop] || 0) >= 1
    ) {
      this.seedsByCrop[crop] -= 1;
      plot.hasCrop = true;
      plot.harvested = false;
      plot.growth = 0.02;
      plot.composted = false;
      plot.moisture = Math.max(0.35, (plot.moisture ?? 0.65) - 0.18);
    } else {
      // Transition bed to 'harvested' state; requires explicit replanting
      plot.hasCrop = false;
      plot.harvested = true;
      plot.growth = 0.0;
      plot.composted = false;
      plot.moisture = Math.max(0.3, (plot.moisture ?? 0.65) - 0.2);
    }

    plot.reservedByVillagerId = null;
    plot.bounceTime = 0;
    plot.bounceActive = !this.reducedMotion;
    this.updatePlotVisuals(plot);

    const surf = this.terrain.getSurfacePointAndNormal(plot.dir);
    this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.23);
    soundEngine.playHarvest();
    this.ambientAudio.playCue('harvest');

    if (this.onHarvestFeedback) {
      this.onHarvestFeedback({
        wheat: crop === 'wheat' ? yieldAmount : 0,
        pumpkin: crop === 'pumpkin' ? yieldAmount : 0,
        berry: crop === 'berry' ? yieldAmount : 0,
      });
    }

    this.syncWorldStats();
    return true;
  }

  /**
   * Sows or replants an existing prepared/harvested garden bed using 1 seed of cropType.
   */
  public replantPlot(
    plotId: string,
    cropType: CropType,
    byVillager = false,
  ): boolean {
    const plot = this.placedObjects.find(
      (o) => o.id === plotId && o.type === 'plot',
    );
    if (!plot) return false;

    const state = this.getPlotLifecycle(plot);
    if (state !== 'prepared' && state !== 'harvested') {
      if (!byVillager) {
        this.showStatusMessage(
          state === 'ripe'
            ? 'Harvest the ripe crop first before replanting'
            : 'A crop is already growing in this bed',
        );
      }
      return false;
    }

    const cfg = CROP_CONFIGS[cropType];
    if (!this.isTierUnlocked(cfg.unlockTier)) {
      if (!byVillager) {
        this.showStatusMessage(`${cfg.label} unlocks at Kitchen Garden tier`);
      }
      return false;
    }

    if ((this.seedsByCrop[cropType] || 0) < 1) {
      if (!byVillager) {
        this.showStatusMessage(
          `No ${cfg.label} seeds available — buy seeds in Inventory`,
        );
      }
      return false;
    }

    this.seedsByCrop[cropType] -= 1;
    this.stats.totalPlanted += 1;

    const prevId = plot.id;
    const prevDir = plot.dir.clone();
    const prevYaw = plot.yaw;
    const prevMoisture = plot.moisture ?? 0.65;
    const prevComposted = Boolean(plot.composted);
    const prevCloche = Boolean(plot.hasCloche);
    const wasSelected = this.selectedEntityId === prevId;

    const idx = this.placedObjects.indexOf(plot);
    if (idx !== -1) {
      this.placedObjects.splice(idx, 1);
    }
    this.objectsGroup.remove(plot.mesh);

    const replacement = this.placeGardenPlot(
      cropType,
      prevDir,
      prevYaw,
      0.02, // 'sown' stage
      prevMoisture,
      prevComposted,
      true,
      {
        id: prevId,
        hasCrop: true,
        harvested: false,
        hasCloche: prevCloche,
      },
    );
    if (wasSelected) {
      this.selectedEntityId = replacement.id;
    }
    soundEngine.playPlant();
    this.ambientAudio.playCue('plant');
    this.syncWorldStats();
    return true;
  }

  /**
   * Harvests all ripe plots and ready beehive/windmill outputs using the shared ripe threshold.
   * Never advances unripe crop growth when nothing is ready.
   */
  public harvestAllRipe(): number {
    const batch: Partial<HarvestFeedbackBatch> = {
      wheat: 0,
      pumpkin: 0,
      berry: 0,
      honey: 0,
      flour: 0,
    };
    let count = 0;
    let burstCount = 0;

    for (const obj of this.placedObjects) {
      if (obj.type === 'plot' && this.getPlotLifecycle(obj) === 'ripe') {
        const pollinated = this.placedObjects.some(
          (h) => h.type === 'beehive' && h.dir.distanceTo(obj.dir) < 0.35,
        );
        const crop = obj.cropType || 'wheat';
        const cfg = CROP_CONFIGS[crop];
        const yieldAmt =
          cfg.baseYield +
          (obj.composted ? cfg.compostBonusYield : 0) +
          (pollinated ? 1 : 0);

        if (crop === 'wheat') {
          this.inventory.wheat += yieldAmt;
          batch.wheat = (batch.wheat || 0) + yieldAmt;
        } else if (crop === 'pumpkin') {
          this.inventory.pumpkin += yieldAmt;
          batch.pumpkin = (batch.pumpkin || 0) + yieldAmt;
        } else {
          this.inventory.berry += yieldAmt;
          batch.berry = (batch.berry || 0) + yieldAmt;
        }

        this.resources.harvestTotal += yieldAmt;
        this.stats.totalHarvested += yieldAmt;
        this.gardenPoints += cfg.gardenPointsOnHarvest;
        if (!this.discoveredCrops.has(crop)) {
          this.discoveredCrops.add(crop);
          this.gardenPoints += 3;
        }

        if (
          this.autoReplantEnabled &&
          this.isTierUnlocked('flourishing_terrarium') &&
          (this.seedsByCrop[crop] || 0) >= 1
        ) {
          this.seedsByCrop[crop] -= 1;
          obj.hasCrop = true;
          obj.harvested = false;
          obj.growth = 0.02;
          obj.composted = false;
        } else {
          obj.hasCrop = false;
          obj.harvested = true;
          obj.growth = 0.0;
          obj.composted = false;
        }
        obj.moisture = Math.max(0.3, (obj.moisture ?? 0.65) - 0.18);
        obj.reservedByVillagerId = null;
        obj.bounceTime = 0;
        obj.bounceActive = !this.reducedMotion;
        this.updatePlotVisuals(obj);

        if (burstCount < 3) {
          const surf = this.terrain.getSurfacePointAndNormal(obj.dir);
          this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.24);
          burstCount++;
        }
        count += yieldAmt;
      }
    }

    // Also collect ready honey from beehives (only when storedOutput >= 1)
    for (const hive of this.placedObjects) {
      if (hive.type === 'beehive' && (hive.storedOutput || 0) >= 1) {
        const gain = hive.storedOutput || 0;
        hive.storedOutput = 0;
        this.inventory.honey += gain;
        this.resources.harvestTotal += gain;
        this.stats.totalHarvested += gain;
        this.gardenPoints += gain * PRODUCTION_CONFIG.beehive.gardenPoints;
        batch.honey = (batch.honey || 0) + gain;
        count += gain;
        if (burstCount < 4) {
          const surf = this.terrain.getSurfacePointAndNormal(hive.dir);
          this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.22);
          burstCount++;
        }
      }
    }

    // Also collect ready flour from windmills (only when storedOutput >= 1)
    for (const mill of this.placedObjects) {
      if (mill.type === 'windmill' && (mill.storedOutput || 0) >= 1) {
        const gain = mill.storedOutput || 0;
        mill.storedOutput = 0;
        this.inventory.flour += gain;
        this.resources.harvestTotal += gain;
        this.gardenPoints += gain * PRODUCTION_CONFIG.windmill.gardenPoints;
        batch.flour = (batch.flour || 0) + gain;
        count += gain;
        if (burstCount < 4) {
          const surf = this.terrain.getSurfacePointAndNormal(mill.dir);
          this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.24);
          burstCount++;
        }
      }
    }

    if (count > 0) {
      soundEngine.playHarvest();
      this.ambientAudio.playCue('harvest');
      if (this.onHarvestFeedback) {
        this.onHarvestFeedback(batch);
      }
    } else {
      this.showStatusMessage('No ripe crops or finished goods are ready yet');
    }

    this.syncWorldStats();
    return count;
  }

  public performBuildingAction(buildingId: string) {
    const obj = this.placedObjects.find((o) => o.id === buildingId);
    if (!obj) return;

    const surf = this.terrain.getSurfacePointAndNormal(obj.dir);

    if (obj.type === 'windmill') {
      const stored = obj.storedOutput || 0;
      if (stored > 0) {
        obj.storedOutput = 0;
        this.inventory.flour += stored;
        this.resources.harvestTotal += stored;
        this.gardenPoints += stored * PRODUCTION_CONFIG.windmill.gardenPoints;
        obj.bounceTime = 0;
        obj.bounceActive = !this.reducedMotion;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.25);
        soundEngine.playHarvest();
        if (this.onHarvestFeedback) {
          this.onHarvestFeedback({ flour: stored });
        }
        this.syncWorldStats();
        return;
      }

      if (obj.isProcessing) {
        this.showStatusMessage('The windmill is currently grinding grain into flour');
        return;
      }
      if (this.inventory.wheat < PRODUCTION_CONFIG.windmill.wheatInput) {
        this.showStatusMessage(
          `Need ${PRODUCTION_CONFIG.windmill.wheatInput} harvested Wheat to mill Flour`,
        );
        return;
      }
      this.inventory.wheat -= PRODUCTION_CONFIG.windmill.wheatInput;
      obj.isProcessing = true;
      obj.productionTimer = 0;
      obj.bounceTime = 0;
      obj.bounceActive = !this.reducedMotion;
      soundEngine.playBuild();
      this.showStatusMessage('Loaded 2 Wheat into the Windmill — milling Flour (40s)');
      this.syncWorldStats();
      return;
    }

    if (obj.type === 'beehive') {
      const stored = obj.storedOutput || 0;
      if (stored < 1) {
        this.showStatusMessage(
          'Bees are still gathering nectar — plant wildflowers nearby to speed honey',
        );
        return;
      }
      obj.storedOutput = 0;
      this.inventory.honey += stored;
      this.resources.harvestTotal += stored;
      this.stats.totalHarvested += stored;
      this.gardenPoints += stored * PRODUCTION_CONFIG.beehive.gardenPoints;
      obj.bounceTime = 0;
      obj.bounceActive = !this.reducedMotion;
      this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.23);
      soundEngine.playHarvest();
      if (this.onHarvestFeedback) {
        this.onHarvestFeedback({ honey: stored });
      }
      this.syncWorldStats();
      return;
    }

    if (obj.type === 'well') {
      if (this.resources.water >= PRODUCTION_CONFIG.well.maxWater) {
        this.showStatusMessage('Your watering can is already full (20/20 Water)');
        return;
      }
      this.resources.water = PRODUCTION_CONFIG.well.maxWater;
      obj.bounceTime = 0;
      obj.bounceActive = !this.reducedMotion;
      this.pixelFx.spawnRipple(surf.point, surf.normal, 'water');
      soundEngine.playWater();
      this.showStatusMessage('Refilled watering can at the Stone Well (20/20 Water)');
      this.syncWorldStats();
      return;
    }

    if (obj.type === 'dock') {
      // Coastal trade exchange: trade 1 Flour or 1 Honey or 2 Produce for Coins + 1 Compost
      if (this.inventory.flour >= 1) {
        this.inventory.flour -= 1;
        this.coins += PRODUCTION_CONFIG.flourSellPrice + 3;
        this.resources.compost += 1;
        this.gardenPoints += 2;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.24);
        soundEngine.playHarvest();
        this.showStatusMessage(
          `Traded 1 Flour at the pier for +${PRODUCTION_CONFIG.flourSellPrice + 3} Coins & +1 Compost`,
        );
      } else if (this.inventory.honey >= 1) {
        this.inventory.honey -= 1;
        this.coins += PRODUCTION_CONFIG.honeySellPrice + 2;
        this.resources.compost += 1;
        this.gardenPoints += 2;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.24);
        soundEngine.playHarvest();
        this.showStatusMessage(
          `Traded 1 Honey at the pier for +${PRODUCTION_CONFIG.honeySellPrice + 2} Coins & +1 Compost`,
        );
      } else if (this.inventory.pumpkin >= 1) {
        this.inventory.pumpkin -= 1;
        this.coins += CROP_CONFIGS.pumpkin.sellPrice + 2;
        this.resources.compost += 1;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.23);
        soundEngine.playHarvest();
        this.showStatusMessage(
          `Traded 1 Pumpkin at the pier for +${CROP_CONFIGS.pumpkin.sellPrice + 2} Coins & +1 Compost`,
        );
      } else if (this.inventory.wheat >= 2) {
        this.inventory.wheat -= 2;
        this.coins += CROP_CONFIGS.wheat.sellPrice * 2 + 2;
        this.resources.compost += 1;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.23);
        soundEngine.playHarvest();
        this.showStatusMessage(
          `Traded 2 Wheat at the pier for +${CROP_CONFIGS.wheat.sellPrice * 2 + 2} Coins & +1 Compost`,
        );
      } else if (this.inventory.berry >= 2) {
        this.inventory.berry -= 2;
        this.coins += CROP_CONFIGS.berry.sellPrice * 2 + 2;
        this.resources.compost += 1;
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.23);
        soundEngine.playHarvest();
        this.showStatusMessage(
          `Traded 2 Berries at the pier for +${CROP_CONFIGS.berry.sellPrice * 2 + 2} Coins & +1 Compost`,
        );
      } else {
        this.pixelFx.spawnRipple(surf.point, surf.normal, 'boat');
        soundEngine.playWater();
        this.showStatusMessage(
          'Bring Flour, Honey, or harvested crops to trade with harbor merchants',
        );
      }
      obj.bounceTime = 0;
      obj.bounceActive = !this.reducedMotion;
      this.syncWorldStats();
      return;
    }

    if (obj.type === 'bridge') {
      this.pixelFx.spawnRipple(surf.point, surf.normal, 'water');
      soundEngine.playWater();
      return;
    }

    // Scenic village landmarks: invite 2 nearby villagers to visit
    obj.bounceTime = 0;
    obj.bounceActive = !this.reducedMotion;
    this.emitSparklesAtDir(obj.dir, '#ffe57f');
    const sorted = [...this.villagers].sort(
      (a, b) => a.dir.distanceTo(obj.dir) - b.dir.distanceTo(obj.dir),
    );
    sorted.slice(0, 2).forEach((v) => {
      v.targetDir = this.getBuildingEntranceDir(obj, 0);
      v.pauseTimer = 0;
    });
    soundEngine.playBuild();
    this.syncWorldStats();
  }

  public removeEntityById(entityId: string) {
    const idx = this.placedObjects.findIndex(
      (o) => o.id === entityId && o.removable,
    );
    if (idx !== -1) {
      const removed = this.placedObjects.splice(idx, 1)[0];
      this.objectsGroup.remove(removed.mesh);
      if (removed.type === 'oak') {
        this.syncCanopyEmitters();
      }
      this.emitSparklesAtDir(removed.dir, '#ffb8b8');
      if (this.selectedEntityId === entityId) {
        this.selectedEntityId = null;
        this.selectionRing.visible = false;
      }
      soundEngine.playSelect();
      this.syncWorldStats();
    }
  }

  public updateVillagerRole(villagerId: string, role: VillagerRole) {
    const v = this.villagers.find((item) => item.id === villagerId);
    if (!v) return;
    // Release any previous plot reservation if switching away from Gardener
    if (v.taskTargetId) {
      const prevPlot = this.placedObjects.find((p) => p.id === v.taskTargetId);
      if (prevPlot && prevPlot.reservedByVillagerId === v.id) {
        prevPlot.reservedByVillagerId = null;
      }
    }
    v.role = role;
    v.taskKind = 'idle';
    v.taskTargetId = null;
    v.workTimer = 0;
    v.pauseTimer = 0;
    this.emitSparklesAtDir(v.dir, '#ffd180');
    soundEngine.playSelect();
    this.syncWorldStats();
  }

  public updateVillagerAssignment(
    villagerId: string,
    assignment: VillagerAssignment,
  ) {
    const v = this.villagers.find((item) => item.id === villagerId);
    if (!v) return;
    v.assignment = assignment;
    v.pauseTimer = 0;

    if (assignment === 'Meadow Plots') {
      const plot = this.placedObjects.find((o) => o.type === 'plot');
      if (plot) v.targetDir = plot.dir.clone();
    } else if (assignment === 'Windmill & Granary') {
      const wm = this.placedObjects.find((o) => o.type === 'windmill');
      if (wm) v.targetDir = this.getBuildingEntranceDir(wm, 0);
    } else if (assignment === 'Apiary & Orchards') {
      const hive = this.placedObjects.find((o) => o.type === 'beehive');
      if (hive) v.targetDir = hive.dir.clone();
    } else if (assignment === 'Coastal Pier') {
      const dock = this.placedObjects.find((o) => o.type === 'dock');
      if (dock) v.targetDir = this.getBuildingEntranceDir(dock, 0);
    } else {
      v.targetDir = this.wellDirection.clone();
    }

    this.emitSparklesAtDir(v.dir, '#b8e986');
    soundEngine.playSelect();
    this.syncWorldStats();
  }

  // =========================================================================
  // Economy, Market, Compost & Free Seed Fallback Actions
  // =========================================================================

  public buySeed(cropType: CropType, count = 1): boolean {
    const cfg = CROP_CONFIGS[cropType];
    if (!this.isTierUnlocked(cfg.unlockTier)) {
      this.showStatusMessage(`${cfg.label} unlocks at Kitchen Garden tier`);
      return false;
    }
    const cost = cfg.seedCost * count;
    if (!this.spendCoins(cost, `${count} ${cfg.label} Seed${count > 1 ? 's' : ''}`)) {
      return false;
    }
    this.seedsByCrop[cropType] = (this.seedsByCrop[cropType] || 0) + count;
    soundEngine.playPlant();
    this.syncWorldStats();
    return true;
  }

  public sellProduce(
    item: 'wheat' | 'pumpkin' | 'berry' | 'honey' | 'flour',
    count = 1,
  ): boolean {
    const available = this.inventory[item] || 0;
    if (available < count) {
      this.showStatusMessage(`Not enough ${item} in pantry to sell`);
      return false;
    }
    const unitPrice =
      item === 'flour'
        ? PRODUCTION_CONFIG.flourSellPrice
        : item === 'honey'
          ? PRODUCTION_CONFIG.honeySellPrice
          : CROP_CONFIGS[item].sellPrice;

    this.inventory[item] -= count;
    const earned = unitPrice * count;
    this.coins += earned;
    soundEngine.playHarvest();
    this.showStatusMessage(`Sold ${count} ${item} for +${earned} Coins`);
    this.syncWorldStats();
    return true;
  }

  public sellAllProduce(): number {
    let totalEarned = 0;
    for (const key of ['berry', 'wheat', 'pumpkin', 'honey', 'flour'] as const) {
      const qty = this.inventory[key] || 0;
      if (qty > 0) {
        const unitPrice =
          key === 'flour'
            ? PRODUCTION_CONFIG.flourSellPrice
            : key === 'honey'
              ? PRODUCTION_CONFIG.honeySellPrice
              : CROP_CONFIGS[key].sellPrice;
        totalEarned += qty * unitPrice;
        this.inventory[key] = 0;
      }
    }
    if (totalEarned > 0) {
      this.coins += totalEarned;
      soundEngine.playHarvest();
      this.showStatusMessage(`Sold pantry goods for +${totalEarned} Coins`);
      this.syncWorldStats();
    } else {
      this.showStatusMessage('No harvested goods in pantry to sell yet');
    }
    return totalEarned;
  }

  public craftCompostFromProduce(): boolean {
    // Convert any 2 produce items into +2 Compost, or purchase +2 Compost for 6 Coins
    const totalProduce =
      this.inventory.berry + this.inventory.wheat + this.inventory.pumpkin;
    if (totalProduce >= PRODUCTION_CONFIG.compostBin.produceInput) {
      let remaining = PRODUCTION_CONFIG.compostBin.produceInput;
      for (const k of ['berry', 'wheat', 'pumpkin'] as const) {
        while (this.inventory[k] > 0 && remaining > 0) {
          this.inventory[k] -= 1;
          remaining -= 1;
        }
      }
      this.resources.compost += PRODUCTION_CONFIG.compostBin.compostOutput;
      soundEngine.playPlant();
      this.showStatusMessage('Composted 2 crop clippings into +2 Rich Compost');
      this.syncWorldStats();
      return true;
    }

    if (this.spendCoins(PRODUCTION_CONFIG.compostBuyCost, '2 Rich Compost')) {
      this.resources.compost += 2;
      soundEngine.playPlant();
      this.showStatusMessage('Purchased +2 Rich Compost');
      this.syncWorldStats();
      return true;
    }
    return false;
  }

  public canClaimFreeSeedFallback(): boolean {
    const totalSeeds =
      (this.seedsByCrop.berry || 0) +
      (this.seedsByCrop.wheat || 0) +
      (this.seedsByCrop.pumpkin || 0);
    const hasGrowingOrRipeCrop = this.placedObjects.some(
      (o) => o.type === 'plot' && (o.hasCrop ?? true),
    );
    const totalProduce =
      this.inventory.berry +
      this.inventory.wheat +
      this.inventory.pumpkin +
      this.inventory.honey +
      this.inventory.flour;
    return (
      totalSeeds === 0 &&
      !hasGrowingOrRipeCrop &&
      totalProduce === 0 &&
      this.coins < CROP_CONFIGS.berry.seedCost
    );
  }

  public claimFreeSeedFallback(): boolean {
    if (!this.canClaimFreeSeedFallback()) {
      return false;
    }
    this.seedsByCrop.berry += 2;
    this.seedsByCrop.wheat += 1;
    this.resources.water = Math.max(this.resources.water, 10);
    soundEngine.playPlant();
    this.showStatusMessage(
      'Received a gift packet of +2 Berry Seeds & +1 Wheat Seed from the village',
    );
    this.syncWorldStats();
    return true;
  }

  public setAutoReplantEnabled(enabled: boolean) {
    if (enabled && !this.isTierUnlocked('flourishing_terrarium')) {
      this.showStatusMessage(
        'Auto-Replant unlocks at Flourishing Terrarium tier (110 Garden Points)',
      );
      return;
    }
    this.autoReplantEnabled = enabled;
    soundEngine.playSelect();
    this.syncWorldStats();
  }

  public setAmbientAudioEnabled(enabled: boolean) {
    this.ambientAudio.setEnabled(enabled);
  }

  public setAmbientAudioVolume(vol: number) {
    this.ambientAudio.setVolume(vol);
  }

  public setPlanetName(name: string) {
    this.planetName = name;
    this.syncWorldStats();
  }

  public setWeatherOverride(phase: WeatherPhase | null) {
    this.weatherOverride = phase;
    this.syncCloudsToSharedWeather();
    soundEngine.playSelect();
    this.syncWorldStats();
  }

  public cycleWeather() {
    const order: (WeatherPhase | null)[] = [
      null,
      'clear',
      'rain',
      'snow',
    ];
    const idx = order.indexOf(this.weatherOverride);
    const next = order[(idx + 1) % order.length];
    this.setWeatherOverride(next);
  }

  public cycleTimeMode() {
    const order: TimeMode[] = ['auto', 'day', 'twilight', 'night'];
    const next = order[(order.indexOf(this.timeMode) + 1) % order.length];
    this.setTimeMode(next);
    soundEngine.playSelect();
  }

  public setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced) {
      this.introSpinActive = false;
      this.angularVelocity.set(0, 0);
    }
    this.syncWorldStats();
  }

  public setTool(tool: ToolId | null) {
    if (tool === 'harvest_all') {
      this.harvestAllRipe();
      return;
    }
    this.activeTool = tool;
    if (tool !== null) {
      // Entering placement mode closes the contextual inspection panel to avoid stacking UI
      this.selectedEntityId = null;
      this.selectionRing.visible = false;
    }
    this.onStateChange((prev) => ({
      ...prev,
      activeTool: tool,
      selectedEntity: tool !== null ? null : prev.selectedEntity,
    }));
  }

  public setTimeMode(mode: TimeMode) {
    this.timeMode = mode;
    if (mode === 'day') {
      this.timeOfDay = 0.22;
    } else if (mode === 'twilight') {
      this.timeOfDay = 0.52;
    } else if (mode === 'night') {
      this.timeOfDay = 0.78;
    }
    this.onStateChange((prev) => ({
      ...prev,
      timeMode: mode,
      timeOfDay: this.timeOfDay,
    }));
  }

  public setTimeOfDayManual(val: number) {
    this.timeMode = 'auto';
    this.timeOfDay = ((val % 1) + 1) % 1;
    this.onStateChange((prev) => ({
      ...prev,
      timeOfDay: this.timeOfDay,
    }));
  }

  public applyCameraPreset(view: CameraViewId, immediate = false) {
    this.activeView = view;
    if (view === 'orb') {
      // Slightly above and to the left, orb filling ~60% of image height
      this.camTargetPos.set(-1.12, 0.78, 4.35);
      this.camTargetLook.set(0.08, -0.22, 0.0);
    } else if (view === 'surface') {
      // Low horizon-skimming view across coastal beach, sea, and hills
      this.camTargetPos.set(0.62, 0.22, 1.44);
      this.camTargetLook.set(-0.12, 0.24, 0.62);
    } else if (view === 'orbit') {
      // Centered close planetary view for sculpting & building
      this.camTargetPos.set(0.0, 0.32, 2.58);
      this.camTargetLook.set(0.0, 0.0, 0.0);
    } else if (view === 'village') {
      // Intimate village-level view inspecting roof tiles, chimney rims, fence rails, and sails
      this.camTargetPos.set(-0.26, 0.34, 1.42);
      this.camTargetLook.set(-0.16, 0.18, 0.74);
    }

    if (immediate) {
      this.camCurrentPos.copy(this.camTargetPos);
      this.camCurrentLook.copy(this.camTargetLook);
      this.camera.position.copy(this.camCurrentPos);
      this.camera.lookAt(this.camCurrentLook);
    }

    this.onStateChange((prev) => ({ ...prev, activeView: view }));
  }

  private clearPreviousTourSpawns() {
    while (this.tourSpawnedCleanups.length > 0) {
      const fn = this.tourSpawnedCleanups.pop();
      if (fn) fn();
    }
  }

  private trackTourPlacedObject(entity: PlacedObjectEntity) {
    this.tourSpawnedCleanups.push(() => {
      const idx = this.placedObjects.indexOf(entity);
      if (idx !== -1) this.placedObjects.splice(idx, 1);
      this.objectsGroup.remove(entity.mesh);
    });
  }

  public startTour() {
    this.clearPreviousTourSpawns();
    this.tourActive = true;
    this.introSpinActive = false;
    this.tourElapsed = 0;
    this.tourStartTimeMs = performance.now();
    this.lastReportedTourRemaining = 30;
    this.tourStepTriggered.clear();
    this.cursorRing.visible = false;
    this.cursorRing.scale.setScalar(1.0);
    (this.cursorRing.material as THREE.MeshBasicMaterial).color.set('#fff8d6');

    // Reset planet orientation & camera to crisp morning establishing frame
    this.angularVelocity.set(0, 0);
    this.planetRoot.quaternion.identity();
    this.timeMode = 'auto';
    this.timeOfDay = 0.22;
    this.tourCursorDir.set(-0.16, 0.22, 0.96).normalize();

    this.camTargetPos.set(-0.85, 0.65, 4.15);
    this.camTargetLook.set(0.0, -0.10, 0.0);
    this.camCurrentPos.copy(this.camTargetPos);
    this.camCurrentLook.copy(this.camTargetLook);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    this.syncWorldStats();
    this.onStateChange((prev) => ({
      ...prev,
      tourActive: true,
      tourElapsed: 0,
      tourPhase: 'Act I: Full Globe Orbit',
    }));
  }

  public stopTour() {
    if (!this.tourActive) return;
    this.tourActive = false;
    this.cursorRing.visible = false;
    this.cursorRing.scale.setScalar(1.0);
    (this.cursorRing.material as THREE.MeshBasicMaterial).color.set('#fff8d6');
    this.applyCameraPreset(this.activeView, false);
    this.onStateChange((prev) => ({
      ...prev,
      tourActive: false,
      tourElapsed: 0,
      tourPhase: '',
    }));
  }

  private updateSimulatedTourCursor(
    t: number,
    fromTime: number,
    clickTime: number,
    fromDir: THREE.Vector3,
    targetDir: THREE.Vector3,
    isWaterTarget = false,
  ) {
    this.cursorRing.visible = true;
    const moveDuration = Math.max(0.15, clickTime - fromTime - 0.12);
    const moveProgress = THREE.MathUtils.clamp(
      (t - fromTime) / moveDuration,
      0,
      1,
    );
    const smoothMove = moveProgress * moveProgress * (3 - 2 * moveProgress);
    this.tourCursorDir.copy(fromDir).lerp(targetDir, smoothMove).normalize();

    this.orientObjectOnSurface(
      this.cursorRing,
      this.tourCursorDir,
      0,
      0.006,
      isWaterTarget,
    );

    // Visual click pulse right around clickTime
    const timeToClick = Math.abs(t - clickTime);
    const ringMat = this.cursorRing.material as THREE.MeshBasicMaterial;
    if (timeToClick < 0.18) {
      const pulse = 1.0 - timeToClick / 0.18;
      this.cursorRing.scale.setScalar(1.35 - pulse * 0.55);
      ringMat.color.set('#ffe066');
      ringMat.opacity = 0.98;
    } else {
      this.cursorRing.scale.setScalar(1.25 + Math.sin(t * 8.0) * 0.08);
      ringMat.color.set('#fff8d6');
      ringMat.opacity = 0.88;
    }
  }

  private updateTour(dt: number) {
    // Use exact wall-clock elapsed time so the tour lasts an exact 30.0 seconds
    this.tourElapsed = (performance.now() - this.tourStartTimeMs) / 1000;
    if (this.tourElapsed >= 30.0) {
      this.tourActive = false;
      this.cursorRing.visible = false;
      this.cursorRing.scale.setScalar(1.0);
      (this.cursorRing.material as THREE.MeshBasicMaterial).color.set('#fff8d6');
      this.applyCameraPreset('orb', false);
      this.onStateChange((prev) => ({
        ...prev,
        tourActive: false,
        tourElapsed: 30,
        tourPhase: '',
      }));
      return;
    }

    const t = this.tourElapsed;
    const remainingSec = Math.max(1, Math.ceil(30.0 - t));
    if (remainingSec !== this.lastReportedTourRemaining) {
      this.lastReportedTourRemaining = remainingSec;
      this.onStateChange((prev) => ({
        ...prev,
        tourElapsed: t,
      }));
    }

    const smoothstep = (val: number) => {
      const c = THREE.MathUtils.clamp(val, 0, 1);
      return c * c * (3 - 2 * c);
    };

    // Waypoint directions for Act III simulated clicks
    const startCursorSpot = new THREE.Vector3(-0.16, 0.22, 0.96).normalize();
    const windmillSpot = new THREE.Vector3(-0.22, 0.44, 0.87).normalize();
    const cottageSpot = new THREE.Vector3(-0.04, -0.02, 0.998).normalize();
    const lighthouseSpot = new THREE.Vector3(0.18, 0.52, 0.835).normalize();
    const sailboatSpot = new THREE.Vector3(0.42, 0.14, 0.896).normalize();
    const villagerSpot = new THREE.Vector3(-0.24, 0.16, 0.957).normalize();
    const sheepSpot = new THREE.Vector3(-0.18, -0.14, 0.974).normalize();
    const campfireSpot = new THREE.Vector3(-0.12, 0.08, 0.99).normalize();
    const snowCloudSpot = new THREE.Vector3(-0.26, 0.42, 0.87).normalize();
    const rainbowSpot = new THREE.Vector3(-0.37, 0.19, 0.95).normalize();
    const balloonSpot = new THREE.Vector3(-0.05, 0.18, 0.98).normalize();

    // =========================================================================
    // ACT I (0.0s – 8.0s): Grand Reveal & Full 360° Globe Orbit
    // =========================================================================
    if (t < 2.0) {
      // 0:00 – 0:02 | Morning Establishing Shot
      const p = smoothstep(t / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.22, 0.24, p);
      this.planetRoot.quaternion.identity();
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.85, -0.45, p),
        THREE.MathUtils.lerp(0.65, 0.52, p),
        THREE.MathUtils.lerp(4.15, 3.85, p),
      );
      this.camTargetLook.set(0.0, -0.10, 0.0);
    } else if (t < 7.0) {
      // 0:02 – 0:07 | Full 360° Planetary Rotation showcasing all 4 neighborhoods & seas
      const p = smoothstep((t - 2.0) / 5.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.24, 0.27, p);
      const spinAngle = p * Math.PI * 2;
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, spinAngle);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.45, 0.0, p),
        THREE.MathUtils.lerp(0.52, 0.42, p),
        THREE.MathUtils.lerp(3.85, 3.45, p),
      );
      this.camTargetLook.set(0.0, -0.06, 0.0);
    } else if (t < 8.0) {
      // 0:07 – 0:08 | Settle Rotation & Zoom-In Transition toward Village
      const p = smoothstep((t - 7.0) / 1.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.27, 0.28, p);
      this.planetRoot.quaternion.identity();
      this.camTargetPos.set(
        THREE.MathUtils.lerp(0.0, -0.28, p),
        THREE.MathUtils.lerp(0.42, 0.36, p),
        THREE.MathUtils.lerp(3.45, 1.52, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(0.0, -0.16, p),
        THREE.MathUtils.lerp(-0.06, 0.22, p),
        THREE.MathUtils.lerp(0.0, 0.72, p),
      );
    }
    // =========================================================================
    // ACT II (8.0s – 15.0s): Close-Up Living World Inspection
    // =========================================================================
    else if (t < 10.5) {
      // 0:08 – 0:10.5 | Focus 1 — Pastel Cottages, Multi-Layered Trees & Walking Villagers
      const p = smoothstep((t - 8.0) / 2.5);
      this.timeOfDay = THREE.MathUtils.lerp(0.28, 0.30, p);
      const yaw = THREE.MathUtils.lerp(0.0, 0.12, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.28, -0.12, p),
        THREE.MathUtils.lerp(0.36, 0.30, p),
        THREE.MathUtils.lerp(1.52, 1.44, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.16, -0.14, p),
        THREE.MathUtils.lerp(0.22, 0.18, p),
        THREE.MathUtils.lerp(0.72, 0.74, p),
      );
    } else if (t < 13.0) {
      // 0:10.5 – 0:13.0 | Focus 2 — Fenced Sheep Pasture & Beehive Meadow
      const p = smoothstep((t - 10.5) / 2.5);
      this.timeOfDay = THREE.MathUtils.lerp(0.30, 0.32, p);
      const yaw = THREE.MathUtils.lerp(0.12, 0.18, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.12, -0.22, p),
        THREE.MathUtils.lerp(0.30, -0.14, p),
        THREE.MathUtils.lerp(1.44, 1.46, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.14, -0.16, p),
        THREE.MathUtils.lerp(0.18, -0.12, p),
        THREE.MathUtils.lerp(0.74, 0.74, p),
      );
    } else if (t < 15.0) {
      // 0:13.0 – 0:15.0 | Focus 3 — Striped Coastal Lighthouse, Timber Pier, Sailboats & Ducks
      const p = smoothstep((t - 13.0) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.32, 0.34, p);
      const yaw = THREE.MathUtils.lerp(0.18, -0.48, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.22, 0.22, p),
        THREE.MathUtils.lerp(-0.14, 0.26, p),
        THREE.MathUtils.lerp(1.46, 1.56, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.16, 0.12, p),
        THREE.MathUtils.lerp(-0.12, 0.16, p),
        THREE.MathUtils.lerp(0.74, 0.72, p),
      );
    }
    // =========================================================================
    // ACT III (15.0s – 23.0s): Simulated Live Building & Interactive Spawning
    // =========================================================================
    else if (t < 17.0) {
      // 0:15.0 – 0:17.0 | Simulated Click 1 — Adding New Windmill & Pastel Cottage
      const p = smoothstep((t - 15.0) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.34, 0.36, p);
      const yaw = THREE.MathUtils.lerp(-0.48, 0.08, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(0.22, -0.18, p),
        THREE.MathUtils.lerp(0.26, 0.32, p),
        THREE.MathUtils.lerp(1.56, 1.68, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(0.12, -0.10, p),
        THREE.MathUtils.lerp(0.16, 0.16, p),
        THREE.MathUtils.lerp(0.72, 0.72, p),
      );

      if (t < 15.7) {
        this.updateSimulatedTourCursor(
          t,
          15.0,
          15.6,
          startCursorSpot,
          windmillSpot,
          false,
        );
      } else {
        this.updateSimulatedTourCursor(
          t,
          15.7,
          16.4,
          windmillSpot,
          cottageSpot,
          false,
        );
      }

      if (t >= 15.6 && !this.tourStepTriggered.has(1)) {
        this.tourStepTriggered.add(1);
        const wmYaw = this.computeYawFacingTarget(windmillSpot, this.wellDirection);
        const wm = this.placeStaticObject('windmill', windmillSpot, wmYaw, true, true);
        this.trackTourPlacedObject(wm);
        this.syncWorldStats();
      }

      if (t >= 16.4 && !this.tourStepTriggered.has(2)) {
        this.tourStepTriggered.add(2);
        const hYaw = this.computeYawFacingTarget(cottageSpot, this.wellDirection);
        const newHouse = this.placeStaticObject('house', cottageSpot, hYaw, true, true);
        this.trackTourPlacedObject(newHouse);
        const doorDir = this.getBuildingEntranceDir(newHouse, 0);
        const pathDir = doorDir.clone().lerp(this.wellDirection, 0.45).normalize();
        const pathYaw = this.computeYawFacingTarget(pathDir, this.wellDirection);
        const newPath = this.placeStaticObject('path', pathDir, pathYaw, true, true);
        this.trackTourPlacedObject(newPath);
        this.spawnVillager(this.getBuildingEntranceDir(newHouse, -0.014), true);
        const v1 = this.villagers[this.villagers.length - 1];
        this.spawnVillager(this.getBuildingEntranceDir(newHouse, 0.014), true);
        const v2 = this.villagers[this.villagers.length - 1];
        this.tourSpawnedCleanups.push(() => {
          for (const v of [v1, v2]) {
            const idx = this.villagers.indexOf(v);
            if (idx !== -1) this.villagers.splice(idx, 1);
            this.inhabitantsGroup.remove(v.mesh);
          }
        });
        this.syncWorldStats();
      }
    } else if (t < 19.0) {
      // 0:17.0 – 0:19.0 | Simulated Click 2 — Adding Second Cliffside Lighthouse & Sailboat
      const p = smoothstep((t - 17.0) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.36, 0.38, p);
      const yaw = THREE.MathUtils.lerp(0.08, -0.35, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.18, 0.24, p),
        THREE.MathUtils.lerp(0.32, 0.34, p),
        THREE.MathUtils.lerp(1.68, 1.72, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.10, 0.10, p),
        THREE.MathUtils.lerp(0.16, 0.22, p),
        THREE.MathUtils.lerp(0.72, 0.72, p),
      );

      if (t < 17.7) {
        this.updateSimulatedTourCursor(
          t,
          17.0,
          17.6,
          cottageSpot,
          lighthouseSpot,
          false,
        );
      } else {
        this.updateSimulatedTourCursor(
          t,
          17.7,
          18.4,
          lighthouseSpot,
          sailboatSpot,
          true,
        );
      }

      if (t >= 17.6 && !this.tourStepTriggered.has(3)) {
        this.tourStepTriggered.add(3);
        const lh = this.placeStaticObject('lighthouse', lighthouseSpot, -0.3, true, true);
        this.trackTourPlacedObject(lh);
        this.syncWorldStats();
      }

      if (t >= 18.4 && !this.tourStepTriggered.has(4)) {
        this.tourStepTriggered.add(4);
        this.spawnSailboat(sailboatSpot, true);
        const boat = this.sailboats[this.sailboats.length - 1];
        this.tourSpawnedCleanups.push(() => {
          const idx = this.sailboats.indexOf(boat);
          if (idx !== -1) this.sailboats.splice(idx, 1);
          this.inhabitantsGroup.remove(boat.mesh);
        });
        this.syncWorldStats();
      }
    } else if (t < 21.0) {
      // 0:19.0 – 0:21.0 | Simulated Click 3 — Spawning Villagers, Sheep, Campfire & Lantern
      const p = smoothstep((t - 19.0) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.38, 0.41, p);
      const yaw = THREE.MathUtils.lerp(-0.35, 0.05, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(0.24, -0.20, p),
        THREE.MathUtils.lerp(0.34, 0.20, p),
        THREE.MathUtils.lerp(1.72, 1.66, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(0.10, -0.14, p),
        THREE.MathUtils.lerp(0.22, 0.10, p),
        THREE.MathUtils.lerp(0.72, 0.74, p),
      );

      if (t < 19.5) {
        this.updateSimulatedTourCursor(
          t,
          19.0,
          19.4,
          sailboatSpot,
          villagerSpot,
          false,
        );
      } else if (t < 20.2) {
        this.updateSimulatedTourCursor(
          t,
          19.5,
          20.1,
          villagerSpot,
          sheepSpot,
          false,
        );
      } else {
        this.updateSimulatedTourCursor(
          t,
          20.2,
          20.7,
          sheepSpot,
          campfireSpot,
          false,
        );
      }

      if (t >= 19.4 && !this.tourStepTriggered.has(5)) {
        this.tourStepTriggered.add(5);
        this.spawnVillager(villagerSpot, true);
        const vA = this.villagers[this.villagers.length - 1];
        this.spawnVillager(
          new THREE.Vector3(-0.10, 0.14, 0.985).normalize(),
          true,
        );
        const vB = this.villagers[this.villagers.length - 1];
        this.tourSpawnedCleanups.push(() => {
          for (const v of [vA, vB]) {
            const idx = this.villagers.indexOf(v);
            if (idx !== -1) this.villagers.splice(idx, 1);
            this.inhabitantsGroup.remove(v.mesh);
          }
        });
        this.syncWorldStats();
      }

      if (t >= 20.1 && !this.tourStepTriggered.has(6)) {
        this.tourStepTriggered.add(6);
        this.spawnSheep(sheepSpot, true, true);
        const sA = this.sheepList[this.sheepList.length - 1];
        this.spawnSheep(
          new THREE.Vector3(-0.28, 0.02, 0.96).normalize(),
          true,
          false,
        );
        const sB = this.sheepList[this.sheepList.length - 1];
        this.tourSpawnedCleanups.push(() => {
          for (const s of [sA, sB]) {
            const idx = this.sheepList.indexOf(s);
            if (idx !== -1) this.sheepList.splice(idx, 1);
            this.inhabitantsGroup.remove(s.mesh);
          }
        });
        this.syncWorldStats();
      }

      if (t >= 20.7 && !this.tourStepTriggered.has(7)) {
        this.tourStepTriggered.add(7);
        const cf = this.placeStaticObject('campfire', campfireSpot, 0.4, true, true);
        this.trackTourPlacedObject(cf);
        const lp = this.placeStaticObject(
          'lantern',
          new THREE.Vector3(-0.24, 0.28, 0.93).normalize(),
          0.0,
          true,
          true,
        );
        this.trackTourPlacedObject(lp);
        this.syncWorldStats();
      }
    } else if (t < 23.0) {
      // 0:21.0 – 0:23.0 | Simulated Click 4 — Weather Magic: Snow/Rain Cloud, Rainbow Arch & Hot Air Balloon
      const p = smoothstep((t - 21.0) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.41, 0.45, p);
      const yaw = THREE.MathUtils.lerp(0.05, 0.0, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.20, -0.16, p),
        THREE.MathUtils.lerp(0.20, 0.34, p),
        THREE.MathUtils.lerp(1.66, 2.15, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.14, -0.08, p),
        THREE.MathUtils.lerp(0.10, 0.18, p),
        THREE.MathUtils.lerp(0.74, 0.55, p),
      );

      if (t < 21.4) {
        this.updateSimulatedTourCursor(
          t,
          21.0,
          21.3,
          campfireSpot,
          snowCloudSpot,
          false,
        );
      } else if (t < 22.0) {
        this.updateSimulatedTourCursor(
          t,
          21.4,
          21.9,
          snowCloudSpot,
          rainbowSpot,
          false,
        );
      } else if (t < 22.75) {
        this.updateSimulatedTourCursor(
          t,
          22.0,
          22.5,
          rainbowSpot,
          balloonSpot,
          false,
        );
      } else {
        this.cursorRing.visible = false;
      }

      if (t >= 21.3 && !this.tourStepTriggered.has(8)) {
        this.tourStepTriggered.add(8);
        this.spawnCloud(snowCloudSpot, true, 5.5, true);
        const snowCloud = this.clouds[this.clouds.length - 1];
        this.tourSpawnedCleanups.push(() => {
          const idx = this.clouds.indexOf(snowCloud);
          if (idx !== -1) this.clouds.splice(idx, 1);
          this.atmosphereGroup.remove(snowCloud.mesh);
        });
        if (this.clouds.length > 0) {
          this.clouds[0].currentDir.set(-0.12, 0.24, 0.96).normalize();
          this.clouds[0].isRaining = true;
          this.clouds[0].rainTimer = 4.5;
        }
        // Nourish existing trees with a joyful growth bounce
        for (const obj of this.placedObjects) {
          if (obj.type === 'oak' || obj.type === 'pine' || obj.type === 'palm') {
            obj.targetGrowth = Math.min(1.38, obj.targetGrowth + 0.16);
            obj.bounceTime = 0;
            obj.bounceActive = true;
          }
        }
        this.syncWorldStats();
      }

      if (t >= 21.9 && !this.tourStepTriggered.has(9)) {
        this.tourStepTriggered.add(9);
        const rb = this.placeStaticObject('rainbow', rainbowSpot, -0.25, true, true);
        this.trackTourPlacedObject(rb);
        this.syncWorldStats();
      }

      if (t >= 22.5 && !this.tourStepTriggered.has(10)) {
        this.tourStepTriggered.add(10);
        this.spawnBalloon(balloonSpot, true);
        const bal = this.balloons[this.balloons.length - 1];
        this.tourSpawnedCleanups.push(() => {
          const idx = this.balloons.indexOf(bal);
          if (idx !== -1) this.balloons.splice(idx, 1);
          this.atmosphereGroup.remove(bal.mesh);
        });
        this.syncWorldStats();
      }
    }
    // =========================================================================
    // ACT IV (23.0s – 30.0s): Golden Twilight, Nighttime Glow & Finale Pull-Back
    // =========================================================================
    else if (t < 26.5) {
      // 0:23.0 – 0:26.5 | Sunset to Blue Twilight & Night Transition (Windows, Campfires, Lighthouses & Fireflies ignite)
      this.cursorRing.visible = false;
      const p = smoothstep((t - 23.0) / 3.5);
      this.timeOfDay = THREE.MathUtils.lerp(0.45, 0.76, p);
      const yaw = THREE.MathUtils.lerp(0.0, -0.18, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.16, 0.18, p),
        THREE.MathUtils.lerp(0.34, 0.32, p),
        THREE.MathUtils.lerp(2.15, 2.35, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.08, -0.04, p),
        THREE.MathUtils.lerp(0.18, 0.12, p),
        THREE.MathUtils.lerp(0.55, 0.42, p),
      );
    } else if (t < 28.5) {
      // 0:26.5 – 0:28.5 | Shooting Star Wonder Moment across the Starry Night Orb
      this.cursorRing.visible = false;
      const p = smoothstep((t - 26.5) / 2.0);
      this.timeOfDay = THREE.MathUtils.lerp(0.76, 0.80, p);
      const yaw = THREE.MathUtils.lerp(-0.18, -0.06, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(0.18, -0.35, p),
        THREE.MathUtils.lerp(0.32, 0.48, p),
        THREE.MathUtils.lerp(2.35, 2.95, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.04, -0.02, p),
        THREE.MathUtils.lerp(0.12, 0.05, p),
        THREE.MathUtils.lerp(0.42, 0.25, p),
      );

      if (t >= 26.6 && !this.tourStepTriggered.has(11)) {
        this.tourStepTriggered.add(11);
        this.spawnShootingStar(new THREE.Vector3(-0.22, 0.52, 0.82).normalize());
      }
      if (t >= 27.4 && !this.tourStepTriggered.has(12)) {
        this.tourStepTriggered.add(12);
        this.spawnShootingStar(new THREE.Vector3(0.25, 0.48, 0.84).normalize());
      }
    } else {
      // 0:28.5 – 0:30.0 | Grand Finale Pull-Back to Full Glass Orb Hero Framing
      this.cursorRing.visible = false;
      const p = smoothstep((t - 28.5) / 1.5);
      this.timeOfDay = THREE.MathUtils.lerp(0.80, 0.82, p);
      const yaw = THREE.MathUtils.lerp(-0.06, 0.0, p);
      this.planetRoot.quaternion.setFromAxisAngle(UP_VEC, yaw);
      this.camTargetPos.set(
        THREE.MathUtils.lerp(-0.35, -1.12, p),
        THREE.MathUtils.lerp(0.48, 0.78, p),
        THREE.MathUtils.lerp(2.95, 4.35, p),
      );
      this.camTargetLook.set(
        THREE.MathUtils.lerp(-0.02, 0.08, p),
        THREE.MathUtils.lerp(0.05, -0.22, p),
        THREE.MathUtils.lerp(0.25, 0.0, p),
      );
    }
  }

  private evaluateMilestones(counts: {
    plots: number;
    flowers: number;
    villagers: number;
  }) {
    for (const m of MILESTONE_DEFINITIONS) {
      if (this.completedMilestones.has(m.id)) continue;
      let cur = 0;
      if (m.id === 'first_harvest') {
        cur = this.stats.totalHarvested;
      } else if (m.id === 'tended_beds') {
        cur = counts.plots;
      } else if (m.id === 'sweet_apiary') {
        cur = counts.flowers;
      } else if (m.id === 'golden_miller') {
        cur = this.inventory.flour;
      } else if (m.id === 'bountiful_pantry') {
        cur = this.stats.totalHarvested;
      } else if (m.id === 'peaceful_hamlet') {
        cur = counts.villagers;
      }
      if (cur >= m.target) {
        this.completedMilestones.add(m.id);
        this.gardenPoints += m.gardenPointsReward;
        this.coins += m.coinsReward;
      }
    }
  }

  private syncWorldStats() {
    const plots = this.placedObjects.filter((o) => o.type === 'plot').length;
    const ripePlots = this.placedObjects.filter(
      (o) => o.type === 'plot' && this.getPlotLifecycle(o) === 'ripe',
    ).length;
    const houses = this.placedObjects.filter((o) => o.type === 'house').length;
    const trees = this.placedObjects.filter(
      (o) => o.type === 'oak' || o.type === 'pine' || o.type === 'palm',
    ).length;
    const windmills = this.placedObjects.filter((o) => o.type === 'windmill').length;
    const lighthouses = this.placedObjects.filter(
      (o) => o.type === 'lighthouse' || o.type === 'watchtower',
    ).length;
    const beehives = this.placedObjects.filter((o) => o.type === 'beehive').length;
    const flowers = this.placedObjects.filter(
      (o) => o.type === 'flower' || o.type === 'beehive',
    ).length;
    const rainbows = this.placedObjects.filter((o) => o.type === 'rainbow').length;
    const campfires = this.placedObjects.filter((o) => o.type === 'campfire').length;
    const villagers = this.villagers.length;
    const sheep = this.sheepList.length;
    const clouds = this.clouds.length;
    const boats = this.sailboats.length + this.ducks.length;

    this.evaluateMilestones({ plots, flowers, villagers });

    const totalSeeds =
      (this.seedsByCrop.berry || 0) +
      (this.seedsByCrop.wheat || 0) +
      (this.seedsByCrop.pumpkin || 0);
    this.resources.seeds = totalSeeds;

    const happiness = Math.min(
      100,
      Math.round(
        78 +
          plots * 1.2 +
          houses * 2 +
          trees * 0.6 +
          flowers * 1.2 +
          windmills * 3 +
          lighthouses * 2 +
          rainbows * 4 +
          campfires * 2 +
          boats * 1.5,
      ),
    );

    const effWeather = this.getEffectiveWeather();
    const weatherSummary: WeatherSummary =
      effWeather === 'snow'
        ? 'Soft Snow'
        : effWeather === 'rain'
          ? 'Gentle Rain'
          : effWeather === 'gathering'
            ? 'Gathering Clouds'
            : effWeather === 'clearing'
              ? 'Fresh After-Rain'
              : 'Clear Breeze';

    const curTierId = this.getCurrentProgressionTier();
    const curTierIdx = PROGRESSION_TIERS.findIndex((t) => t.id === curTierId);
    const curTier = PROGRESSION_TIERS[curTierIdx] || PROGRESSION_TIERS[0];
    const nextTier =
      curTierIdx + 1 < PROGRESSION_TIERS.length
        ? PROGRESSION_TIERS[curTierIdx + 1]
        : null;

    const selectedEntity = this.buildSelectedEntityInfo();
    const canClaimFreeSeeds = this.canClaimFreeSeedFallback();

    this.onStateChange((prev) => ({
      ...prev,
      planetName: this.planetName,
      population: villagers,
      happiness,
      dayCount: this.dayCount,
      timeOfDay: this.timeOfDay,
      weatherSummary,
      weatherPhase: effWeather,
      weatherOverride: this.weatherOverride,
      season: this.season,
      reducedMotion: this.reducedMotion,
      selectedEntity,
      coins: this.coins,
      gardenPoints: this.gardenPoints,
      progressionTier: curTierId,
      progressionTierLabel: curTier.label,
      nextTierLabel: nextTier ? nextTier.label : null,
      nextTierPoints: nextTier ? nextTier.requiredPoints : null,
      autoReplantUnlocked: this.isTierUnlocked('flourishing_terrarium'),
      autoReplantEnabled: this.autoReplantEnabled,
      canClaimFreeSeeds,
      seedsByCrop: { ...this.seedsByCrop },
      completedMilestones: Array.from(this.completedMilestones),
      statusMessage: this.statusMessage,
      lastSavedAt: this.lastSavedAt,
      resources: { ...this.resources },
      inventory: { ...this.inventory },
      stats: { ...this.stats },
      objectCounts: {
        plots,
        ripePlots,
        houses,
        trees,
        windmills,
        lighthouses,
        villagers,
        sheep,
        clouds,
        flowers,
        boats,
        beehives,
      },
    }));
  }

  private bindEvents() {
    const dom =
      this.renderer?.domElement || this.fallbackCanvas || this.container;
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    const updateNDC = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getTerrainHit = (e: PointerEvent) => {
      updateNDC(e);
      raycaster.setFromCamera(pointerNDC, this.camera);
      const hits = raycaster.intersectObjects(
        [
          this.objectsGroup,
          this.inhabitantsGroup,
          this.terrain.terrainMesh,
          this.terrain.waterMesh,
        ],
        true,
      );
      if (hits.length > 0) {
        const worldPt = hits[0].point.clone();
        const localPt = this.planetRoot.worldToLocal(worldPt);
        return localPt.normalize();
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (this.tourActive) return;
      this.isPointerDown = true;
      this.isDraggingSpin = false;
      this.pointerDownPos.set(e.clientX, e.clientY);
      this.lastPointerPos.set(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.tourActive) {
        return;
      }
      const hitDir = getTerrainHit(e);
      if (hitDir && !this.isDraggingSpin && this.activeTool !== null) {
        this.cursorRing.visible = true;
        const surf = this.terrain.getSurfacePointAndNormal(hitDir);
        this.orientObjectOnSurface(
          this.cursorRing,
          hitDir,
          0,
          0.004,
          surf.isWater,
        );
      } else {
        this.cursorRing.visible = false;
      }

      if (!this.isPointerDown) return;

      const dx = e.clientX - this.lastPointerPos.x;
      const dy = e.clientY - this.lastPointerPos.y;
      const totalDist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );

      if (totalDist > 5) {
        this.isDraggingSpin = true;
        this.cursorRing.visible = false;
      }

      if (this.isDraggingSpin) {
        this.angularVelocity.x = dx * 0.0055;
        this.angularVelocity.y = dy * 0.0055;
        this.applyPlanetSpin(this.angularVelocity.x, this.angularVelocity.y);
      }

      this.lastPointerPos.set(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      if (!this.isDraggingSpin && e.button === 0) {
        const hitDir = getTerrainHit(e);
        if (hitDir) {
          this.handleSurfaceAction(hitDir);
        } else if (this.activeTool === null && this.selectedEntityId) {
          this.clearSelection();
        }
      }
      this.isDraggingSpin = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.tourActive) return;
      const zoomDir = this.camTargetPos
        .clone()
        .sub(this.camTargetLook)
        .normalize();
      const dist = this.camTargetPos.distanceTo(this.camTargetLook);
      const nextDist = THREE.MathUtils.clamp(
        dist + e.deltaY * 0.0022,
        1.15,
        5.6,
      );
      this.camTargetPos
        .copy(this.camTargetLook)
        .addScaledVector(zoomDir, nextDist);
    };

    const onResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.renderer) {
        this.renderer.setSize(w, h);
      } else if (this.fallbackCanvas) {
        this.fallbackCanvas.width = w;
        this.fallbackCanvas.height = h;
        this.fallbackCanvas.style.width = `${w}px`;
        this.fallbackCanvas.style.height = `${h}px`;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      onResize();
    });
    resizeObserver.observe(this.container);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.tourActive) {
        this.stopTour();
      }
    };

    const onVisibilityChange = () => {
      this.isTabHidden = document.hidden;
      if (!this.isTabHidden) {
        this.clock.getDelta();
      } else {
        this.saveGameManual(true);
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);

    (this as unknown as { _cleanup: () => void })._cleanup = () => {
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }

  private applyPlanetSpin(deltaYaw: number, deltaPitch: number) {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      deltaYaw,
    );
    const qPitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      deltaPitch,
    );
    this.planetRoot.quaternion.premultiply(qYaw).premultiply(qPitch);
  }

  private syncCloudsToSharedWeather() {
    const eff = this.getEffectiveWeather();
    if (eff === 'snow' && !this.clouds.some((c) => c.isSnow)) {
      this.spawnCloud(this.wellDirection.clone(), false, 15.0, true);
    }
    for (const c of this.clouds) {
      if (eff === 'rain') {
        c.isRaining = !c.isSnow;
      } else if (eff === 'snow') {
        c.isRaining = c.isSnow;
      } else {
        c.isRaining = false;
      }
    }
  }

  private updateWeatherAndSeason(dt: number) {
    // 1. Season progression (Spring -> Summer -> Autumn -> Winter)
    this.seasonTimer += dt;
    if (this.seasonTimer >= SEASON_DURATION_SEC) {
      this.seasonTimer = 0;
      const curIdx = SEASONS_ORDER.indexOf(this.season);
      this.season = SEASONS_ORDER[(curIdx + 1) % SEASONS_ORDER.length];
      this.syncWorldStats();
    }

    // 2. Natural weather phase transitions when not manually overridden
    if (this.weatherOverride === null) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        if (this.weatherPhase === 'clear') {
          this.weatherPhase = 'gathering';
          this.weatherTimer = WEATHER_PHASE_DURATIONS.gathering;
        } else if (this.weatherPhase === 'gathering') {
          this.weatherPhase = this.season === 'winter' ? 'snow' : 'rain';
          this.weatherTimer =
            this.weatherPhase === 'snow'
              ? WEATHER_PHASE_DURATIONS.snow
              : WEATHER_PHASE_DURATIONS.rain;
        } else if (this.weatherPhase === 'rain' || this.weatherPhase === 'snow') {
          const wasRain = this.weatherPhase === 'rain';
          this.weatherPhase = 'clearing';
          this.weatherTimer = WEATHER_PHASE_DURATIONS.clearing;
          // Occasional rainbow after rain clears
          if (
            wasRain &&
            Math.random() < 0.45 &&
            !this.placedObjects.some((o) => o.type === 'rainbow')
          ) {
            const rbDir = new THREE.Vector3(-0.32, 0.22, 0.92).normalize();
            const yaw = this.findCollisionFreeRainbowYaw(rbDir);
            this.placeStaticObject('rainbow', rbDir, yaw, true, true);
          }
        } else {
          this.weatherPhase = 'clear';
          this.weatherTimer = WEATHER_PHASE_DURATIONS.clear;
        }
        this.syncCloudsToSharedWeather();
        this.syncWorldStats();
      }
    }
  }

  private scheduleNextFrame() {
    if (!this.renderer) {
      this.timerFrameId = window.setTimeout(this.animate, 60);
      return;
    }
    if (this.isSoftwareGl) {
      try {
        const gl = this.renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              this.timerFrameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              this.timerFrameId = window.setTimeout(this.animate, 80);
            }
          };
          this.timerFrameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback if fenceSync unavailable
      }
      this.timerFrameId = window.setTimeout(this.animate, 80);
    } else {
      this.animFrameId = requestAnimationFrame(this.animate);
    }
  }

  private renderFallback2D(
    elapsed: number,
    dayFactor: number,
    twilightFactor: number,
    nightFactor: number,
  ) {
    const canvas = this.fallbackCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.49;
    const orbR = Math.min(w, h) * 0.31;
    const planetR = orbR * 0.52;

    // 1. Evening / Twilight / Night Sky Backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (nightFactor > 0.5) {
      skyGrad.addColorStop(0, '#0d1024');
      skyGrad.addColorStop(0.55, '#19203d');
      skyGrad.addColorStop(1, '#272c4a');
    } else if (twilightFactor > 0.4) {
      skyGrad.addColorStop(0, '#232c54');
      skyGrad.addColorStop(0.55, '#475482');
      skyGrad.addColorStop(1, '#8c729e');
    } else {
      skyGrad.addColorStop(0, '#73639c');
      skyGrad.addColorStop(0.55, '#ae99c9');
      skyGrad.addColorStop(1, '#e0c2d6');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Chalky Windowsill & Turned Walnut Stand
    const sillY = cy + orbR * 1.12;
    ctx.fillStyle = '#f2ede4';
    ctx.fillRect(0, sillY, w, h - sillY);
    ctx.fillStyle = '#dfd6c7';
    ctx.fillRect(0, sillY, w, 10);

    // Walnut stand & brass collar
    ctx.fillStyle = '#593a24';
    ctx.beginPath();
    ctx.moveTo(cx - orbR * 0.48, sillY + 6);
    ctx.lineTo(cx + orbR * 0.48, sillY + 6);
    ctx.lineTo(cx + orbR * 0.36, cy + orbR * 0.86);
    ctx.lineTo(cx - orbR * 0.36, cy + orbR * 0.86);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d4af5f';
    ctx.fillRect(
      cx - orbR * 0.38,
      cy + orbR * 0.82,
      orbR * 0.76,
      orbR * 0.11,
    );

    // 3. Miniature Planet inside the Orb
    const planetGrad = ctx.createRadialGradient(
      cx - planetR * 0.28,
      cy - planetR * 0.28,
      planetR * 0.1,
      cx,
      cy,
      planetR,
    );
    planetGrad.addColorStop(0, dayFactor > 0.3 ? '#8ec973' : '#58855c');
    planetGrad.addColorStop(0.65, dayFactor > 0.3 ? '#5f9e4c' : '#3a6142');
    planetGrad.addColorStop(1, '#2f5c56');
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
    ctx.fill();

    // Orbiting Sun & Moon
    const sunAngle = (this.timeOfDay - 0.22) * Math.PI * 2;
    const orbitR = orbR * 0.78;
    const sx = cx + Math.sin(sunAngle) * orbitR;
    const sy = cy - Math.cos(sunAngle) * orbitR * 0.65;
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();

    const mx = cx - Math.sin(sunAngle) * orbitR;
    const my = cy + Math.cos(sunAngle) * orbitR * 0.65;
    ctx.fillStyle = '#dce8ff';
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();

    // 4. Outer Glass Orb Shell & Window Reflection
    ctx.strokeStyle = 'rgba(195, 242, 224, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 250, 240, 0.16)';
    ctx.beginPath();
    ctx.ellipse(
      cx - orbR * 0.42,
      cy - orbR * 0.38,
      orbR * 0.22,
      orbR * 0.14,
      -0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    void elapsed;
  }

  private animate = () => {
    if (this.isTabHidden) {
      this.scheduleNextFrame();
      return;
    }

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // Periodic autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0 && !this.tourActive) {
      this.autosaveTimer = 25;
      this.saveGameManual(true);
    }

    if (this.shootingStarGazeTimer > 0) {
      this.shootingStarGazeTimer = Math.max(0, this.shootingStarGazeTimer - dt);
    }

    // 1. Tour or Auto Time-of-Day advancement (~12-minute calm day = 1/720 per sec)
    if (this.tourActive) {
      this.updateTour(dt);
    } else {
      this.updateWeatherAndSeason(dt);
      if (this.timeMode === 'auto') {
        const prevTime = this.timeOfDay;
        this.timeOfDay = (this.timeOfDay + dt / 720) % 1.0;
        if (this.timeOfDay < prevTime) {
          this.dayCount += 1;
          this.syncWorldStats();
        }
      }
    }

    // 2. Planet rotational inertia when not actively dragging
    if (!this.isPointerDown && !this.tourActive) {
      if (this.angularVelocity.lengthSq() > 1e-7) {
        this.applyPlanetSpin(this.angularVelocity.x, this.angularVelocity.y);
        this.angularVelocity.multiplyScalar(0.94);
      }
    }

    // 3. Smooth Camera Interpolation
    this.camCurrentPos.lerp(this.camTargetPos, 1.0 - Math.exp(-dt * 4.5));
    this.camCurrentLook.lerp(this.camTargetLook, 1.0 - Math.exp(-dt * 4.5));
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    // 4. Compute Day / Blue Twilight / Night factors from timeOfDay (0..1)
    const t = this.timeOfDay;
    let dayFactor = 0;
    let twilightFactor = 0;
    let nightFactor = 0;

    if (t < 0.38) {
      dayFactor = 1.0;
    } else if (t < 0.54) {
      const p = (t - 0.38) / 0.16;
      dayFactor = 1.0 - p;
      twilightFactor = p;
    } else if (t < 0.68) {
      const p = (t - 0.54) / 0.14;
      twilightFactor = 1.0 - p;
      nightFactor = p;
    } else if (t < 0.88) {
      nightFactor = 1.0;
    } else {
      const p = (t - 0.88) / 0.12;
      nightFactor = 1.0 - p;
      dayFactor = p;
    }

    // 5. Orbit the Little Sun & Pale Moon on opposing sides of a tilted curved path
    const orbitAngle = (t - 0.22) * Math.PI * 2;
    const orbitRadius = 1.24;
    const sunPos = new THREE.Vector3(
      Math.sin(orbitAngle) * orbitRadius,
      Math.cos(orbitAngle) * orbitRadius * 0.72 + 0.12,
      Math.cos(orbitAngle) * orbitRadius * 0.68,
    );
    const moonPos = sunPos.clone().negate();

    this.sunGroup.position.copy(sunPos);
    this.sunGroup.lookAt(0, 0, 0);
    const sunRayCrown = this.sunGroup.getObjectByName('sunRayCrown');
    if (sunRayCrown) {
      sunRayCrown.rotation.z = elapsed * 0.45;
    }
    const sunAstrolabeRing = this.sunGroup.getObjectByName('sunAstrolabeRing');
    if (sunAstrolabeRing) {
      sunAstrolabeRing.rotation.x = 0.65 + Math.sin(elapsed * 0.8) * 0.25;
      sunAstrolabeRing.rotation.y = elapsed * 0.6;
    }

    this.sunLight.position.copy(sunPos);
    this.moonGroup.position.copy(moonPos);
    const moonBody = this.moonGroup.getObjectByName('moonBody');
    if (moonBody) {
      moonBody.rotation.y = elapsed * 0.22;
    }
    const moonStarlets = this.moonGroup.getObjectByName('moonStarlets');
    if (moonStarlets) {
      moonStarlets.rotation.y = -elapsed * 0.65;
      moonStarlets.rotation.z = Math.sin(elapsed * 0.9) * 0.18;
    }
    this.moonLight.position.copy(moonPos);

    const effWeather = this.getEffectiveWeather();
    const isRaining = effWeather === 'rain';
    const isSnowing = effWeather === 'snow';
    const weatherDim = isRaining || isSnowing ? 0.82 : effWeather === 'gathering' ? 0.9 : 1.0;

    this.sunLight.intensity =
      (1.95 * dayFactor + 0.75 * twilightFactor) * weatherDim;
    this.sunLight.color.setRGB(
      1.0,
      THREE.MathUtils.lerp(0.95, 0.68, twilightFactor),
      THREE.MathUtils.lerp(0.78, 0.45, twilightFactor),
    );
    this.moonLight.intensity = 1.35 * nightFactor + 0.45 * twilightFactor;

    this.roomWindowLight.intensity =
      1.35 * dayFactor + 0.65 * twilightFactor + 0.18 * nightFactor;
    this.roomAmbientLight.intensity =
      0.55 * dayFactor + 0.38 * twilightFactor + 0.22 * nightFactor;
    this.roomHemiLight.intensity =
      0.52 * dayFactor + 0.44 * twilightFactor + 0.28 * nightFactor;

    const terrainWeatherMode: WeatherMode = isSnowing
      ? 'snow'
      : isRaining
        ? 'rain'
        : 'clear';
    this.roomEnv.updateTimeOfDay(dayFactor, twilightFactor, nightFactor, elapsed);
    this.terrain.update(elapsed, dt, nightFactor, terrainWeatherMode);
    this.ambientAudio.update(dayFactor, nightFactor, isRaining, isSnowing);

    // 6. Update Placed Objects (Crop Growth, Windmill Production, Beehive Production, Lights)
    const warmGlowFactor = Math.min(1.0, twilightFactor * 0.85 + nightFactor * 1.0);

    for (const obj of this.placedObjects) {
      if (obj.type === 'plot') {
        const hasCrop = obj.hasCrop ?? true;
        const moisture = obj.moisture ?? 0.6;

        // Shared weather moisture coupling
        if (isRaining) {
          obj.moisture = Math.min(1.0, moisture + dt * 0.032);
        } else if (effWeather === 'clearing') {
          obj.moisture = Math.max(0.45, moisture - dt * 0.0005);
        } else if (effWeather === 'clear' && dayFactor > 0.3) {
          obj.moisture = Math.max(0.12, moisture - dt * 0.0018);
        } else {
          obj.moisture = Math.max(0.18, moisture - dt * 0.0009);
        }

        if (hasCrop && !isPlotRipe(obj.growth)) {
          const pausedByCold =
            (isSnowing || this.season === 'winter') && !obj.hasCloche;
          if (!pausedByCold) {
            const cropType = obj.cropType || 'wheat';
            const baseDuration = CROP_CONFIGS[cropType].growthDurationSec;
            const curM = obj.moisture ?? 0.6;
            const moistureMult =
              curM >= 0.35 ? 1.0 + (curM - 0.35) * 0.3 : 0.35;
            const compostMult = obj.composted ? 1.25 : 1.0;
            const nearHive = this.placedObjects.some(
              (h) => h.type === 'beehive' && h.dir.distanceTo(obj.dir) < 0.35,
            );
            const hiveMult = nearHive ? 1.18 : 1.0;

            const wasRipe = isPlotRipe(obj.growth);
            obj.growth = Math.min(
              1.0,
              obj.growth +
                (dt / baseDuration) * moistureMult * compostMult * hiveMult,
            );
            if (!wasRipe && isPlotRipe(obj.growth)) {
              this.syncWorldStats();
            }
          }
        }
        this.updatePlotVisuals(obj);
      } else if (obj.type === 'windmill') {
        if (obj.isProcessing) {
          obj.productionTimer = (obj.productionTimer || 0) + dt;
          if (
            obj.productionTimer >=
            PRODUCTION_CONFIG.windmill.processDurationSec
          ) {
            obj.isProcessing = false;
            obj.productionTimer = 0;
            obj.storedOutput = Math.min(
              PRODUCTION_CONFIG.windmill.maxStorage,
              (obj.storedOutput || 0) + PRODUCTION_CONFIG.windmill.flourOutput,
            );
            this.syncWorldStats();
          }
        }
      } else if (obj.type === 'beehive') {
        const stored = obj.storedOutput || 0;
        if (
          stored < PRODUCTION_CONFIG.beehive.maxStorage &&
          !isRaining &&
          !isSnowing
        ) {
          const nearbyFlowers = this.placedObjects.filter(
            (f) => f.type === 'flower' && f.dir.distanceTo(obj.dir) < 0.28,
          ).length;
          const flowerMult = 1.0 + Math.min(4, nearbyFlowers) * 0.15;
          obj.productionTimer = (obj.productionTimer || 0) + dt * flowerMult;
          if (obj.productionTimer >= PRODUCTION_CONFIG.beehive.baseDurationSec) {
            obj.productionTimer = 0;
            obj.storedOutput = stored + 1;
            this.syncWorldStats();
          }
        }
      } else if (Math.abs(obj.growth - obj.targetGrowth) > 0.001) {
        obj.growth = THREE.MathUtils.lerp(obj.growth, obj.targetGrowth, dt * 3.5);
      }

      let bounceScale = 1.0;
      if (obj.bounceActive) {
        obj.bounceTime += dt;
        if (obj.bounceTime < 0.65) {
          const p = obj.bounceTime / 0.65;
          bounceScale =
            1.0 - Math.exp(-p * 6.0) * Math.cos(p * Math.PI * 3.5) * 0.65;
        } else {
          obj.bounceActive = false;
        }
      }
      const baseScale = obj.type === 'plot' ? 1.0 : obj.growth;
      obj.mesh.scale.setScalar(baseScale * bounceScale);

      if (obj.windmillRotor && !this.reducedMotion) {
        const spinRate = obj.isProcessing ? 1.95 : 1.05;
        obj.windmillRotor.rotation.z -= dt * spinRate;
      }

      if (obj.windowMaterials) {
        const emIntensity = 0.15 + warmGlowFactor * 2.1;
        for (const wm of obj.windowMaterials) {
          wm.emissiveIntensity = emIntensity;
        }
      }

      if (obj.lighthouseBeamPivot && obj.lighthouseConeMats && obj.lighthousePointLight) {
        if (this.tourActive && this.tourElapsed >= 27.0) {
          obj.mesh.updateMatrixWorld(true);
          const worldQuat = new THREE.Quaternion();
          obj.mesh.getWorldQuaternion(worldQuat);
          const lanternWorldPos = new THREE.Vector3(0, 0.14, 0).applyMatrix4(
            obj.mesh.matrixWorld,
          );
          const viewDir = lanternWorldPos
            .clone()
            .sub(this.camera.position)
            .normalize();
          const towerUpWorld = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(worldQuat)
            .normalize();
          const perpWorld = new THREE.Vector3()
            .crossVectors(towerUpWorld, viewDir)
            .normalize();
          const perpLocal = perpWorld
            .clone()
            .applyQuaternion(worldQuat.clone().invert());
          const targetRotY = Math.atan2(perpLocal.x, perpLocal.z);

          const angleDiff =
            (((targetRotY - obj.lighthouseBeamPivot.rotation.y) % Math.PI) +
              Math.PI * 1.5) %
              Math.PI -
            Math.PI * 0.5;
          obj.lighthouseBeamPivot.rotation.y +=
            angleDiff * Math.min(1.0, dt * 6.5);
        } else {
          obj.lighthouseBeamPivot.rotation.y += dt * 1.25;
        }
        const beamOpacity = warmGlowFactor * 0.42;
        for (const cm of obj.lighthouseConeMats) {
          cm.opacity = beamOpacity;
        }
        obj.lighthousePointLight.intensity = warmGlowFactor * 0.85;
      }

      if (obj.campfireFlameGroup && obj.campfireEmbers && obj.campfireLight) {
        const flicker = 1.0 + Math.sin(elapsed * 18.0 + obj.yaw) * 0.16;
        obj.campfireFlameGroup.scale.set(
          1.0 + Math.cos(elapsed * 14.0) * 0.1,
          flicker,
          1.0 + Math.sin(elapsed * 16.0) * 0.1,
        );
        obj.campfireLight.intensity = (0.38 + warmGlowFactor * 0.95) * flicker;

        const emberPos = obj.campfireEmbers.geometry.attributes.position;
        for (let i = 0; i < emberPos.count; i++) {
          let y = emberPos.getY(i) + dt * 0.032;
          if (y > 0.058) y = 0.01;
          const x = Math.sin(elapsed * 5.0 + i * 2.1) * 0.006;
          const z = Math.cos(elapsed * 4.5 + i * 1.7) * 0.006;
          emberPos.setXYZ(i, x, y, z);
        }
        emberPos.needsUpdate = true;
      }

      if (obj.watchtowerFlag) {
        obj.watchtowerFlag.rotation.y =
          Math.sin(elapsed * 5.2 + obj.yaw) * 0.24;
      }

      if (obj.butterflySwarm) {
        obj.butterflySwarm.rotation.y = elapsed * 1.4;
        obj.butterflySwarm.children.forEach((bPivot, idx) => {
          bPivot.position.y =
            0.008 + Math.sin(elapsed * 4.2 + idx * 1.6) * 0.008;
          const flap = Math.sin(elapsed * 22.0 + idx) * 0.55;
          if (bPivot.children[0]) bPivot.children[0].rotation.y = 0.4 + flap;
          if (bPivot.children[1]) bPivot.children[1].rotation.y = -0.4 - flap;
        });
      }
    }

    // 7. Update Villagers (with real functional jobs for Gardener, Miller, Beekeeper)
    this.updateVillagersSimulation(dt, elapsed);

    // 8. Update White Sheep grazing inside the fenced pasture & respecting all fences/structures
    const bridgesAndDocks = this.placedObjects.filter(
      (o) => o.type === 'bridge' || o.type === 'dock',
    );
    const pRight = new THREE.Vector3()
      .crossVectors(UP_VEC, this.pastureCenter)
      .normalize();
    const pUp = new THREE.Vector3()
      .crossVectors(this.pastureCenter, pRight)
      .normalize();

    for (const s of this.sheepList) {
      s.grazeTimer -= dt;
      if (s.grazeTimer <= 0) {
        s.isGrazing = !s.isGrazing;
        s.grazeTimer = s.isGrazing
          ? 2.0 + Math.random() * 2.5
          : 2.2 + Math.random() * 2.0;
        if (!s.isGrazing) {
          if (s.inPasture) {
            const maxR = this.pastureRadius - 0.025;
            for (let attempt = 0; attempt < 12; attempt++) {
              const angle = Math.random() * Math.PI * 2;
              const r = (0.15 + Math.random() * 0.85) * maxR;
              const candidate = this.pastureCenter
                .clone()
                .addScaledVector(pRight, Math.cos(angle) * r)
                .addScaledVector(pUp, Math.sin(angle) * r)
                .normalize();
              if (this.isPositionClearOfObstacles(candidate, 0.012, true)) {
                s.targetDir.copy(candidate);
                break;
              }
            }
          } else {
            for (let attempt = 0; attempt < 12; attempt++) {
              const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 0.14,
                (Math.random() - 0.5) * 0.14,
                (Math.random() - 0.5) * 0.14,
              );
              const candidate = s.dir.clone().add(offset).normalize();
              if (this.isPositionClearOfObstacles(candidate, 0.014, false)) {
                s.targetDir.copy(candidate);
                break;
              }
            }
          }
        }
      }

      s.tailMesh.rotation.y = Math.sin(elapsed * 8.5 + s.walkPhase) * 0.32;

      if (s.isGrazing) {
        s.headGroup.rotation.x =
          0.48 + Math.sin(elapsed * 7.0 + s.walkPhase) * 0.14;
        for (const leg of s.legs) {
          leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, 0, dt * 8);
        }
      } else {
        s.headGroup.rotation.x = THREE.MathUtils.lerp(
          s.headGroup.rotation.x,
          0.0,
          dt * 6.0,
        );
        const dist = s.dir.distanceTo(s.targetDir);
        if (dist > 0.008) {
          const prevSheepDir = s.dir.clone();
          s.dir
            .lerp(s.targetDir, (s.speed * dt) / Math.max(dist, 0.01))
            .normalize();

          const hitBoundary = this.resolveSheepCollisions(s, prevSheepDir);
          if (hitBoundary) {
            s.targetDir.copy(
              s.inPasture ? this.pastureCenter : prevSheepDir,
            );
          }

          s.walkPhase += dt * 12.0;
          const stride = Math.sin(s.walkPhase);
          const hop = Math.abs(stride) * 0.0025;

          if (s.legs.length === 4) {
            s.legs[0].rotation.x = stride * 0.45;
            s.legs[1].rotation.x = -stride * 0.45;
            s.legs[2].rotation.x = -stride * 0.45;
            s.legs[3].rotation.x = stride * 0.45;
          }

          const surf = this.terrain.getSurfacePointAndNormal(s.dir);
          s.mesh.position.copy(surf.point).addScaledVector(surf.normal, hop);

          const moveTangent = s.targetDir
            .clone()
            .sub(s.dir)
            .projectOnPlane(surf.normal)
            .normalize();
          const alignQuat = new THREE.Quaternion().setFromUnitVectors(
            UP_VEC,
            surf.normal,
          );
          if (moveTangent.lengthSq() > 1e-5) {
            const invAlign = alignQuat.clone().invert();
            const localTangent = moveTangent.clone().applyQuaternion(invAlign);
            const targetYaw = Math.atan2(localTangent.x, localTangent.z);
            let diff = targetYaw - s.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            s.yaw += diff * Math.min(1.0, dt * 8.0);
          }
          const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, s.yaw);
          s.mesh.quaternion.copy(alignQuat).multiply(yawQuat);
        } else {
          s.isGrazing = true;
          s.grazeTimer = 1.8 + Math.random() * 2.2;
        }
      }
    }

    // 9. Update Sailboats
    for (const b of this.sailboats) {
      b.lanternMat.emissiveIntensity = 0.2 + warmGlowFactor * 2.3;

      const dist = b.dir.distanceTo(b.targetDir);
      if (dist < 0.03) {
        b.targetDir = this.pickRandomWaterTarget(b.dir);
      } else {
        const nextDir = b.dir
          .clone()
          .lerp(b.targetDir, (b.speed * dt) / Math.max(dist, 0.01))
          .normalize();
        const surf = this.terrain.getSurfacePointAndNormal(nextDir);
        const hitsPier = bridgesAndDocks.some(
          (pier) => pier.dir.distanceTo(nextDir) < 0.052,
        );
        const hitsOtherBoat = this.sailboats.some(
          (other) => other !== b && other.dir.distanceTo(nextDir) < 0.048,
        );

        if (surf.isWater && !hitsPier && !hitsOtherBoat) {
          const tangent = b.targetDir
            .clone()
            .sub(b.dir)
            .projectOnPlane(nextDir)
            .normalize();
          if (tangent.lengthSq() > 1e-5) {
            b.yaw = Math.atan2(tangent.x, tangent.z);
          }
          b.dir.copy(nextDir);
        } else {
          b.targetDir = this.pickRandomWaterTarget(b.dir);
        }
      }

      const bobOffset = Math.sin(elapsed * 2.6 + b.bobPhase) * 0.0022;
      this.orientObjectOnSurface(b.mesh, b.dir, b.yaw, bobOffset, true);
      b.hullGroup.rotation.z = Math.sin(elapsed * 2.1 + b.bobPhase) * 0.085;
      b.hullGroup.rotation.x = Math.cos(elapsed * 1.8 + b.bobPhase) * 0.05;
    }

    // 10. Update Paddling Swans & Ducks
    for (const d of this.ducks) {
      const dist = d.dir.distanceTo(d.targetDir);
      if (dist < 0.025) {
        d.targetDir = this.pickRandomWaterTarget(d.dir);
      } else {
        const nextDir = d.dir
          .clone()
          .lerp(d.targetDir, (d.speed * dt) / Math.max(dist, 0.01))
          .normalize();
        const surf = this.terrain.getSurfacePointAndNormal(nextDir);
        const hitsPier = bridgesAndDocks.some(
          (pier) => pier.dir.distanceTo(nextDir) < 0.044,
        );
        const hitsBoat = this.sailboats.some(
          (boat) => boat.dir.distanceTo(nextDir) < 0.045,
        );

        if (surf.isWater && !hitsPier && !hitsBoat) {
          const tangent = d.targetDir
            .clone()
            .sub(d.dir)
            .projectOnPlane(nextDir)
            .normalize();
          if (tangent.lengthSq() > 1e-5) {
            d.yaw = Math.atan2(tangent.x, tangent.z);
          }
          d.dir.copy(nextDir);
        } else {
          d.targetDir = this.pickRandomWaterTarget(d.dir);
        }
      }

      const bobOffset = Math.sin(elapsed * 3.4 + d.bobPhase) * 0.0012;
      this.orientObjectOnSurface(d.mesh, d.dir, d.yaw, bobOffset, true);

      d.rippleRings.forEach((ring, idx) => {
        const rippleCycle = (elapsed * 0.85 + idx * 0.5 + d.bobPhase) % 1.0;
        const scale = 0.8 + rippleCycle * 1.45;
        ring.scale.setScalar(scale);
        (ring.material as THREE.MeshBasicMaterial).opacity =
          (1.0 - rippleCycle) * 0.45;
      });
    }

    // 11. Update Hot Air Balloons
    for (const bal of this.balloons) {
      const qStep = new THREE.Quaternion().setFromAxisAngle(
        bal.orbitAxis,
        bal.orbitSpeed * dt,
      );
      bal.currentDir.applyQuaternion(qStep).normalize();
      const alt =
        bal.baseAltitude + Math.sin(elapsed * 1.2 + bal.phase) * 0.018;
      bal.mesh.position.copy(bal.currentDir).multiplyScalar(alt);
      bal.mesh.quaternion.setFromUnitVectors(UP_VEC, bal.currentDir);

      const burnerPulse =
        Math.max(0, Math.sin(elapsed * 2.4 + bal.phase * 2.0)) * 1.8;
      bal.burnerMat.emissiveIntensity = 0.7 + burnerPulse + warmGlowFactor * 1.1;
    }

    // 12. Update Puffy Clouds & Frosty Snow Clouds (driven by shared weather controller)
    for (const c of this.clouds) {
      const qStep = new THREE.Quaternion().setFromAxisAngle(
        c.orbitAxis,
        c.orbitSpeed * dt,
      );
      c.currentDir.applyQuaternion(qStep).normalize();
      c.mesh.position.copy(c.currentDir).multiplyScalar(c.altitude);
      c.mesh.quaternion.setFromUnitVectors(UP_VEC, c.currentDir);

      if (!this.tourActive) {
        c.isRaining = c.isSnow ? isSnowing : isRaining;
      }

      if (c.isSnow && c.snowPoints && c.snowMat) {
        const targetSnowOpacity = c.isRaining ? 0.88 : 0.0;
        c.snowMat.opacity = THREE.MathUtils.lerp(
          c.snowMat.opacity,
          targetSnowOpacity,
          dt * 4.0,
        );
        if (c.isRaining) {
          c.snowPoints.position.y = -((elapsed * 0.14) % 0.06);
          c.snowPoints.rotation.y = elapsed * 0.8;
          this.terrain.applySnowAtDirection(c.currentDir, dt);
        }
      } else {
        const targetRainOpacity = c.isRaining ? 0.65 : 0.0;
        c.rainMat.opacity = THREE.MathUtils.lerp(
          c.rainMat.opacity,
          targetRainOpacity,
          dt * 4.0,
        );

        if (c.isRaining) {
          c.rainLines.position.y = -((elapsed * 0.38) % 0.06);
          this.terrain.applyRainAtDirection(c.currentDir, dt);
        }
      }
    }

    // 13. Update Shooting Stars
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const st = this.shootingStars[i];
      st.age += dt;
      if (st.age >= st.maxAge) {
        this.atmosphereGroup.remove(st.mesh);
        this.shootingStars.splice(i, 1);
        continue;
      }

      const prevPos = st.currentDir.clone().multiplyScalar(st.altitude);
      const qStep = new THREE.Quaternion().setFromAxisAngle(
        st.orbitAxis,
        st.speed * dt,
      );
      st.currentDir.applyQuaternion(qStep).normalize();
      const nextPos = st.currentDir.clone().multiplyScalar(st.altitude);

      st.mesh.position.copy(nextPos);
      const velDir = nextPos.clone().sub(prevPos).normalize();
      if (velDir.lengthSq() > 1e-5) {
        const targetLook = nextPos.clone().add(velDir);
        st.mesh.lookAt(targetLook);
      }

      const fade = 1.0 - Math.pow(st.age / st.maxAge, 2.0);
      st.mesh.scale.setScalar(Math.max(0.01, fade));

      st.sparkleTimer += dt;
      if (st.sparkleTimer > 0.09) {
        st.sparkleTimer = 0;
        this.emitSparklesAtDir(st.currentDir, '#fff4b8', st.altitude);
      }
    }

    // 14. Update QuietPixelEffectsCoordinator (Ripples, Collect Bursts, Dusk/Night Fireflies, Seasonal Petals/Leaves)
    this.firefliesMat.opacity = 0; // Replaced by PixelFX wandering/pulsing firefly clusters
    this.pixelFx.update(dt, elapsed, {
      nightFactor,
      twilightFactor,
      season: this.season,
      isRaining,
      sampleWaterSurfacePoint: () => {
        if (this.sailboats.length > 0 && Math.random() < 0.5) {
          const b = this.sailboats[Math.floor(Math.random() * this.sailboats.length)];
          const d = this.pickRandomWaterTarget(b.dir);
          return {
            pos: d.clone().multiplyScalar(this.terrain.seaLevel),
            normal: d,
          };
        }
        const seaCenter = new THREE.Vector3(0.62, -0.16, 0.76).normalize();
        const d = this.pickRandomWaterTarget(seaCenter);
        return {
          pos: d.clone().multiplyScalar(this.terrain.seaLevel),
          normal: d,
        };
      },
    });

    // 15. Update Sparkle Bursts
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const b = this.sparkles[i];
      b.age += dt;
      if (b.age >= b.maxAge) {
        this.effectsGroup.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.sparkles.splice(i, 1);
        continue;
      }
      const posAttr = b.points.geometry.attributes.position;
      for (let k = 0; k < b.velocities.length; k++) {
        const vx = posAttr.getX(k) + b.velocities[k].x * dt;
        const vy = posAttr.getY(k) + b.velocities[k].y * dt;
        const vz = posAttr.getZ(k) + b.velocities[k].z * dt;
        posAttr.setXYZ(k, vx, vy, vz);
      }
      posAttr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity =
        1.0 - b.age / b.maxAge;
    }

    // 16. Update Contextual Selection Ring on surface
    if (this.selectedEntityId && !this.tourActive) {
      const selObj = this.placedObjects.find((o) => o.id === this.selectedEntityId);
      const selVil = !selObj
        ? this.villagers.find((v) => v.id === this.selectedEntityId)
        : undefined;
      const targetDir = selObj ? selObj.dir : selVil ? selVil.dir : null;

      if (targetDir) {
        this.selectionRing.visible = true;
        const stickToSea = selObj?.type === 'dock' || selObj?.type === 'bridge';
        this.orientObjectOnSurface(
          this.selectionRing,
          targetDir,
          elapsed * (this.reducedMotion ? 0 : 0.45),
          0.005,
          stickToSea,
        );
        const scaleBase = selVil ? 0.68 : selObj?.type === 'plot' ? 0.96 : 1.18;
        this.selectionRing.scale.setScalar(scaleBase);

        if (elapsed - this.lastSelectionSyncTime > 0.85) {
          this.lastSelectionSyncTime = elapsed;
          this.syncWorldStats();
        }
      } else {
        this.selectionRing.visible = false;
      }
    } else {
      this.selectionRing.visible = false;
    }

    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.renderFallback2D(elapsed, dayFactor, twilightFactor, nightFactor);
    }
    this.scheduleNextFrame();
  };

  private assignFunctionalJobIfAvailable(v: VillagerEntity): boolean {
    if (v.role === 'Gardener') {
      // Find unreserved dry plot (< 65% moisture) or harvested plot if auto-replant is unlocked
      for (const p of this.placedObjects) {
        if (p.type !== 'plot') continue;
        if (p.reservedByVillagerId && p.reservedByVillagerId !== v.id) continue;

        const state = this.getPlotLifecycle(p);
        if (
          (p.hasCrop ?? true) &&
          state !== 'ripe' &&
          (p.moisture ?? 0.6) < 0.65
        ) {
          p.reservedByVillagerId = v.id;
          v.taskKind = 'watering_plot';
          v.taskTargetId = p.id;
          v.targetDir = this.getBuildingEntranceDir(p, 0);
          const cropLabel = CROP_CONFIGS[p.cropType || 'wheat'].label;
          v.liveActivityLabel = `Walking to water ${cropLabel} bed`;
          return true;
        }

        if (
          state === 'harvested' &&
          this.autoReplantEnabled &&
          this.isTierUnlocked('flourishing_terrarium')
        ) {
          const crop = p.cropType || 'berry';
          if ((this.seedsByCrop[crop] || 0) >= 1) {
            p.reservedByVillagerId = v.id;
            v.taskKind = 'replanting_plot';
            v.taskTargetId = p.id;
            v.targetDir = this.getBuildingEntranceDir(p, 0);
            v.liveActivityLabel = `Walking to replant ${CROP_CONFIGS[crop].label} bed`;
            return true;
          }
        }
      }
    } else if (v.role === 'Miller') {
      const mill = this.placedObjects.find(
        (o) =>
          o.type === 'windmill' &&
          ((o.storedOutput || 0) >= 1 ||
            (!o.isProcessing &&
              this.inventory.wheat >= PRODUCTION_CONFIG.windmill.wheatInput)),
      );
      if (mill) {
        v.taskKind = 'tending_mill';
        v.taskTargetId = mill.id;
        v.targetDir = this.getBuildingEntranceDir(mill, 0);
        v.liveActivityLabel =
          (mill.storedOutput || 0) >= 1
            ? 'Walking to Windmill to collect Flour'
            : 'Carrying Wheat to the Windmill';
        return true;
      }
    } else if (v.role === 'Beekeeper') {
      const hive = this.placedObjects.find(
        (o) => o.type === 'beehive' && (o.storedOutput || 0) >= 1,
      );
      if (hive) {
        v.taskKind = 'tending_hive';
        v.taskTargetId = hive.id;
        v.targetDir = this.getBuildingEntranceDir(hive, 0);
        v.liveActivityLabel = 'Walking to Apiary to gather Honey';
        return true;
      }
    }
    return false;
  }

  private completeVillagerTask(v: VillagerEntity) {
    if (!v.taskTargetId) {
      v.taskKind = 'idle';
      return;
    }
    const targetObj = this.placedObjects.find((o) => o.id === v.taskTargetId);
    if (!targetObj) {
      v.taskKind = 'idle';
      v.taskTargetId = null;
      return;
    }

    if (v.taskKind === 'watering_plot' && targetObj.type === 'plot') {
      targetObj.reservedByVillagerId = null;
      this.waterPlot(targetObj.id, true);
      v.liveActivityLabel = `Watered ${CROP_CONFIGS[targetObj.cropType || 'wheat'].label} bed`;
    } else if (v.taskKind === 'replanting_plot' && targetObj.type === 'plot') {
      targetObj.reservedByVillagerId = null;
      const crop = targetObj.cropType || 'berry';
      this.replantPlot(targetObj.id, crop, true);
      v.liveActivityLabel = `Sowed fresh ${CROP_CONFIGS[crop].label} seeds`;
    } else if (v.taskKind === 'tending_mill' && targetObj.type === 'windmill') {
      if ((targetObj.storedOutput || 0) >= 1) {
        const gain = targetObj.storedOutput || 0;
        targetObj.storedOutput = 0;
        this.inventory.flour += gain;
        this.resources.harvestTotal += gain;
        const surf = this.terrain.getSurfacePointAndNormal(targetObj.dir);
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.22);
        v.liveActivityLabel = `Collected +${gain} Flour from Windmill`;
        this.syncWorldStats();
      } else if (
        !targetObj.isProcessing &&
        this.inventory.wheat >= PRODUCTION_CONFIG.windmill.wheatInput
      ) {
        this.inventory.wheat -= PRODUCTION_CONFIG.windmill.wheatInput;
        targetObj.isProcessing = true;
        targetObj.productionTimer = 0;
        v.liveActivityLabel = 'Loaded 2 Wheat into the Windmill';
        this.syncWorldStats();
      }
    } else if (v.taskKind === 'tending_hive' && targetObj.type === 'beehive') {
      if ((targetObj.storedOutput || 0) >= 1) {
        const gain = targetObj.storedOutput || 0;
        targetObj.storedOutput = 0;
        this.inventory.honey += gain;
        this.resources.harvestTotal += gain;
        const surf = this.terrain.getSurfacePointAndNormal(targetObj.dir);
        this.pixelFx.spawnCollectBurst(surf.point, surf.normal, 0.22);
        v.liveActivityLabel = `Gathered +${gain} Honey from Apiary`;
        this.syncWorldStats();
      }
    }

    v.taskKind = 'idle';
    v.taskTargetId = null;
  }

  private updateVillagersSimulation(dt: number, elapsed: number) {
    const bridgesAndDocks = this.placedObjects.filter(
      (o) => o.type === 'bridge' || o.type === 'dock',
    );
    const villagerRadius = 0.012;

    for (const v of this.villagers) {
      if (this.shootingStarGazeTimer > 0) {
        v.bodyMesh.position.y = Math.abs(Math.sin(elapsed * 10.0)) * 0.0025;
        v.headGroup.rotation.x = THREE.MathUtils.lerp(
          v.headGroup.rotation.x,
          -0.42,
          dt * 6.0,
        );
        v.leftLeg.rotation.x = 0;
        v.rightLeg.rotation.x = 0;
        v.leftArm.rotation.x = 0;
        v.rightArm.rotation.x = -2.4 + Math.sin(elapsed * 14.0) * 0.35;
        continue;
      }

      // Active tending work animation at target plot/building
      if ((v.workTimer || 0) > 0) {
        v.workTimer = (v.workTimer || 0) - dt;
        v.bodyMesh.position.y = 0;
        v.leftLeg.rotation.x = 0;
        v.rightLeg.rotation.x = 0;
        v.leftArm.rotation.x = -0.6 + Math.sin(elapsed * 10.0) * 0.35;
        v.rightArm.rotation.x = -0.6 - Math.sin(elapsed * 10.0) * 0.35;
        v.headGroup.rotation.x = 0.22;
        if ((v.workTimer || 0) <= 0) {
          v.workTimer = 0;
          this.completeVillagerTask(v);
          v.pauseTimer = 0.8;
        }
        continue;
      }

      if (v.pauseTimer > 0) {
        v.pauseTimer -= dt;
        v.bodyMesh.position.y = 0;
        v.leftLeg.rotation.x = THREE.MathUtils.lerp(v.leftLeg.rotation.x, 0, dt * 8);
        v.rightLeg.rotation.x = THREE.MathUtils.lerp(v.rightLeg.rotation.x, 0, dt * 8);
        v.leftArm.rotation.x = THREE.MathUtils.lerp(v.leftArm.rotation.x, 0, dt * 8);
        v.rightArm.rotation.x = THREE.MathUtils.lerp(v.rightArm.rotation.x, 0, dt * 8);
        v.headGroup.rotation.x = THREE.MathUtils.lerp(v.headGroup.rotation.x, 0, dt * 6);
        v.headGroup.rotation.y = Math.sin(elapsed * 2.2 + v.walkPhase) * 0.25;
        if (v.pauseTimer <= 0 && (!v.taskKind || v.taskKind === 'idle')) {
          if (!this.assignFunctionalJobIfAvailable(v)) {
            v.headingToWell = !v.headingToWell;
            v.targetDir = this.pickNextVillagerTarget(v.headingToWell, v.dir);
            v.liveActivityLabel = `Strolling near ${v.assignment}`;
          }
        }
        continue;
      }

      const distToTarget = v.dir.distanceTo(v.targetDir);
      if (distToTarget < 0.032) {
        if (v.taskKind && v.taskKind !== 'idle') {
          v.workTimer = 1.8;
          if (v.taskKind === 'watering_plot') {
            v.liveActivityLabel = 'Watering dry garden bed';
          } else if (v.taskKind === 'replanting_plot') {
            v.liveActivityLabel = 'Sowing seeds in garden bed';
          } else if (v.taskKind === 'tending_mill') {
            v.liveActivityLabel = 'Tending the Grain Windmill';
          } else if (v.taskKind === 'tending_hive') {
            v.liveActivityLabel = 'Tending the Meadow Apiary';
          }
          continue;
        }

        if (!this.assignFunctionalJobIfAvailable(v)) {
          v.headingToWell = !v.headingToWell;
          v.targetDir = this.pickNextVillagerTarget(v.headingToWell, v.dir);
          v.pauseTimer = 0.9 + Math.random() * 1.4;
          v.liveActivityLabel = `Resting near ${v.assignment}`;
        }
        v.stuckTimer = 0;
        continue;
      }

      const prevDir = v.dir.clone();
      const surfBefore = this.terrain.getSurfacePointAndNormal(v.dir);

      const desiredTangent = v.targetDir
        .clone()
        .sub(v.dir)
        .projectOnPlane(surfBefore.normal)
        .normalize();

      const steerVec = desiredTangent.clone();
      const signHint = v.steerSign || 1;

      for (const obj of this.placedObjects) {
        if (obj.type === 'fence') {
          const { segA, segB, railAxis } = this.getFenceSegmentOnSphere(obj);
          const closest = this.closestPointOnSphereSegment(v.dir, segA, segB);
          const dFence = v.dir.distanceTo(closest);
          const minClear = 0.015 + villagerRadius;
          const avoidDist = minClear + 0.036;
          if (dFence < avoidDist && dFence > 1e-6) {
            const awayNormal = v.dir
              .clone()
              .sub(closest)
              .projectOnPlane(surfBefore.normal)
              .normalize();
            const alongRail =
              railAxis.dot(desiredTangent) >= 0
                ? railAxis.clone()
                : railAxis.clone().negate();
            const weight = Math.pow(
              1.0 - Math.max(0, dFence - minClear) / (avoidDist - minClear),
              1.35,
            );
            steerVec.addScaledVector(alongRail, weight * 1.65);
            steerVec.addScaledVector(awayNormal, weight * 1.25);
          }
          continue;
        }

        if (obj.type === 'rainbow') {
          const [footA, footB] = this.getRainbowFootDirs(obj.dir, obj.yaw);
          for (const footDir of [footA, footB]) {
            const dFoot = v.dir.distanceTo(footDir);
            const minClear = 0.026 + villagerRadius;
            const avoidDist = minClear + 0.042;
            if (dFoot < avoidDist && dFoot > 1e-6) {
              const away = v.dir
                .clone()
                .sub(footDir)
                .projectOnPlane(surfBefore.normal)
                .normalize();
              const weight = Math.pow(
                1.0 - Math.max(0, dFoot - minClear) / (avoidDist - minClear),
                1.35,
              );
              steerVec.addScaledVector(away, weight * 1.5);
            }
          }
          continue;
        }

        const obsR = this.getObjectCollisionRadius(obj.type);
        if (obsR <= 0) continue;

        const dObs = v.dir.distanceTo(obj.dir);
        const minClear = obsR + villagerRadius;
        const avoidDist = minClear + 0.048;

        if (dObs < avoidDist && dObs > 1e-6) {
          const toObs = obj.dir
            .clone()
            .sub(v.dir)
            .projectOnPlane(surfBefore.normal);
          const toObsNorm = toObs.clone().normalize();
          const approaching = toObsNorm.dot(desiredTangent);

          if (approaching > -0.15 || dObs < minClear + 0.014) {
            const tangentLeft = new THREE.Vector3()
              .crossVectors(surfBefore.normal, toObsNorm)
              .normalize();
            const dotLeft = tangentLeft.dot(desiredTangent);
            const chosenTangent =
              Math.abs(dotLeft) > 0.08
                ? dotLeft >= 0
                  ? tangentLeft
                  : tangentLeft.clone().negate()
                : tangentLeft.clone().multiplyScalar(signHint);
            const awayRadial = toObsNorm.clone().negate();

            const weight = Math.pow(
              1.0 - Math.max(0, dObs - minClear) / (avoidDist - minClear),
              1.35,
            );
            steerVec.addScaledVector(chosenTangent, weight * 1.85);
            steerVec.addScaledVector(awayRadial, weight * 1.15);
          }
        }
      }

      const dPasture = v.dir.distanceTo(this.pastureCenter);
      const pastureClear = this.pastureRadius + villagerRadius + 0.008;
      const pastureAvoid = pastureClear + 0.044;
      if (dPasture < pastureAvoid && dPasture > 1e-6) {
        const toPasture = this.pastureCenter
          .clone()
          .sub(v.dir)
          .projectOnPlane(surfBefore.normal)
          .normalize();
        if (toPasture.dot(desiredTangent) > -0.1 || dPasture < pastureClear + 0.01) {
          const tangentLeft = new THREE.Vector3()
            .crossVectors(surfBefore.normal, toPasture)
            .normalize();
          const chosenTangent =
            tangentLeft.dot(desiredTangent) >= 0
              ? tangentLeft
              : tangentLeft.clone().negate();
          const weight = Math.pow(
            1.0 - Math.max(0, dPasture - pastureClear) / (pastureAvoid - pastureClear),
            1.35,
          );
          steerVec.addScaledVector(chosenTangent, weight * 1.85);
          steerVec.addScaledVector(toPasture.clone().negate(), weight * 1.25);
        }
      }

      for (const other of this.villagers) {
        if (other === v) continue;
        const dOther = v.dir.distanceTo(other.dir);
        if (dOther < 0.028 && dOther > 1e-6) {
          const away = v.dir
            .clone()
            .sub(other.dir)
            .projectOnPlane(surfBefore.normal)
            .normalize();
          steerVec.addScaledVector(away, ((0.028 - dOther) / 0.028) * 0.9);
        }
      }

      steerVec.projectOnPlane(surfBefore.normal).normalize();
      if (steerVec.lengthSq() < 1e-6) {
        steerVec.copy(desiredTangent);
      }

      v.dir.addScaledVector(steerVec, v.speed * dt).normalize();
      this.resolveVillagerCollisions(v, bridgesAndDocks, prevDir);

      const actualStep = v.dir.distanceTo(prevDir);
      if (actualStep < v.speed * dt * 0.18) {
        v.stuckTimer = (v.stuckTimer || 0) + dt;
        if (v.stuckTimer > 1.1) {
          if (v.taskTargetId) {
            const p = this.placedObjects.find((o) => o.id === v.taskTargetId);
            if (p && p.reservedByVillagerId === v.id) {
              p.reservedByVillagerId = null;
            }
          }
          v.taskKind = 'idle';
          v.taskTargetId = null;
          v.steerSign = -(v.steerSign || 1);
          v.headingToWell = !v.headingToWell;
          v.targetDir = this.pickNextVillagerTarget(v.headingToWell, v.dir);
          v.stuckTimer = 0;
        }
      } else {
        v.stuckTimer = Math.max(0, (v.stuckTimer || 0) - dt * 0.5);
      }

      const surf = this.terrain.getSurfacePointAndNormal(v.dir);
      const bridgeObj = bridgesAndDocks.find(
        (b) => b.dir.distanceTo(v.dir) < 0.056,
      );

      v.walkPhase += dt * 13.5;
      const stride = Math.sin(v.walkPhase);
      const hop = Math.abs(stride) * 0.0032;

      v.leftLeg.rotation.x = stride * 0.58;
      v.rightLeg.rotation.x = -stride * 0.58;
      v.leftArm.rotation.x = -stride * 0.46;
      v.rightArm.rotation.x = stride * 0.46;
      v.headGroup.rotation.x = Math.abs(stride) * 0.08;
      v.headGroup.rotation.y = 0;

      let basePt = surf.point;
      if (bridgeObj) {
        const dRatio = THREE.MathUtils.clamp(
          v.dir.distanceTo(bridgeObj.dir) / 0.048,
          0,
          1,
        );
        const deckHeight =
          bridgeObj.type === 'bridge'
            ? 0.015 + (1.0 - dRatio * dRatio) * 0.017
            : 0.019;
        basePt = v.dir
          .clone()
          .multiplyScalar(Math.max(surf.radius, this.terrain.seaLevel + deckHeight));
      }
      v.mesh.position.copy(basePt).addScaledVector(surf.normal, hop);

      const actualMoveTangent = v.dir
        .clone()
        .sub(prevDir)
        .projectOnPlane(surf.normal);
      const faceTangent =
        actualMoveTangent.lengthSq() > 1e-7
          ? actualMoveTangent.normalize()
          : steerVec;

      if (faceTangent.lengthSq() > 1e-5) {
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(
          UP_VEC,
          surf.normal,
        );
        const invAlign = alignQuat.clone().invert();
        const localTangent = faceTangent.clone().applyQuaternion(invAlign);
        const targetYaw = Math.atan2(localTangent.x, localTangent.z);
        let diff = targetYaw - v.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.yaw += diff * Math.min(1.0, dt * 10.0);
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP_VEC, v.yaw);
        v.mesh.quaternion.copy(alignQuat).multiply(yawQuat);
      }
    }
  }

  // =========================================================================
  // Save / Load / Export / Import / Reset Persistence
  // =========================================================================

  public serializeWorldSave(): SerializedWorldSaveV2 {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      planetName: this.planetName,
      dayCount: this.dayCount,
      timeMode: this.timeMode,
      timeOfDay: this.timeOfDay,
      season: this.season,
      seasonTimer: this.seasonTimer,
      weatherPhase: this.weatherPhase,
      weatherTimer: this.weatherTimer,
      weatherOverride: this.weatherOverride,
      reducedMotion: this.reducedMotion,
      autoReplantEnabled: this.autoReplantEnabled,
      coins: this.coins,
      gardenPoints: this.gardenPoints,
      seedsByCrop: { ...this.seedsByCrop },
      resources: {
        water: this.resources.water,
        compost: this.resources.compost,
        harvestTotal: this.resources.harvestTotal,
      },
      inventory: { ...this.inventory },
      stats: { ...this.stats },
      completedMilestones: Array.from(this.completedMilestones),
      discoveredCrops: Array.from(this.discoveredCrops),
      terrainRadii: this.terrain.uniqueVertices.map((uv) => uv.radius),
      tilledFacets: this.terrain.facets.map((f) => f.isTilled),
      placedObjects: this.placedObjects.map((o) => ({
        id: o.id,
        type: o.type,
        dir: [o.dir.x, o.dir.y, o.dir.z],
        yaw: o.yaw,
        growth: o.growth,
        targetGrowth: o.targetGrowth,
        removable: o.removable,
        cropType: o.cropType,
        hasCrop: o.hasCrop,
        harvested: o.harvested,
        moisture: o.moisture,
        composted: o.composted,
        hasCloche: o.hasCloche,
        isProcessing: o.isProcessing,
        productionTimer: o.productionTimer,
        storedOutput: o.storedOutput,
        customTitle: o.customTitle,
      })),
      villagers: this.villagers.map((v) => ({
        id: v.id,
        name: v.name,
        role: v.role,
        assignment: v.assignment,
        dir: [v.dir.x, v.dir.y, v.dir.z],
        yaw: v.yaw,
      })),
      sheep: this.sheepList.map((s) => ({
        id: s.id,
        dir: [s.dir.x, s.dir.y, s.dir.z],
        yaw: s.yaw,
        inPasture: Boolean(s.inPasture),
      })),
    };
  }

  public saveGameManual(silent = false): boolean {
    const save = this.serializeWorldSave();
    const ok = saveWorldToStorage(save);
    if (ok) {
      this.lastSavedAt = save.savedAt;
      if (!silent) {
        soundEngine.playSelect();
        this.showStatusMessage('Saved terrarium world to browser storage');
      }
      this.syncWorldStats();
    }
    return ok;
  }

  public exportSaveJson(): string {
    return JSON.stringify(this.serializeWorldSave(), null, 2);
  }

  public importSaveJson(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      const valid = validateWorldSave(parsed);
      if (!valid) {
        this.showStatusMessage('Invalid save file format — current world preserved');
        return false;
      }
      this.restoreFromSerializedSave(valid);
      saveWorldToStorage(valid);
      soundEngine.playHarvest();
      this.showStatusMessage('Restored terrarium world from save file');
      this.syncWorldStats();
      return true;
    } catch {
      this.showStatusMessage('Could not parse save JSON — current world preserved');
      return false;
    }
  }

  public resetWorldToDefault() {
    clearWorldStorage();
    this.clearCurrentWorldEntities();
    this.planetName = 'Little Meadow';
    this.coins = 32;
    this.gardenPoints = 6;
    this.seedsByCrop = { berry: 5, wheat: 5, pumpkin: 2 };
    this.discoveredCrops = new Set(['berry', 'wheat']);
    this.completedMilestones.clear();
    this.autoReplantEnabled = false;
    this.season = 'spring';
    this.seasonTimer = 0;
    this.weatherPhase = 'clear';
    this.weatherTimer = WEATHER_PHASE_DURATIONS.clear;
    this.weatherOverride = null;
    this.resources = { seeds: 12, water: 18, compost: 4, harvestTotal: 6 };
    this.inventory = { wheat: 2, pumpkin: 1, berry: 2, honey: 1, flour: 1 };
    this.stats = { totalPlanted: 6, totalHarvested: 6, totalTended: 4 };
    this.populateInitialWorld();
    this.syncCanopyEmitters();
    soundEngine.playSelect();
    this.showStatusMessage('Reset terrarium to a fresh Little Meadow');
    this.syncWorldStats();
  }

  private clearCurrentWorldEntities() {
    for (const o of this.placedObjects) {
      this.objectsGroup.remove(o.mesh);
    }
    for (const v of this.villagers) {
      this.inhabitantsGroup.remove(v.mesh);
    }
    for (const s of this.sheepList) {
      this.inhabitantsGroup.remove(s.mesh);
    }
    for (const b of this.sailboats) {
      this.inhabitantsGroup.remove(b.mesh);
    }
    for (const d of this.ducks) {
      this.inhabitantsGroup.remove(d.mesh);
    }
    for (const bal of this.balloons) {
      this.atmosphereGroup.remove(bal.mesh);
    }
    for (const c of this.clouds) {
      this.atmosphereGroup.remove(c.mesh);
    }
    this.placedObjects = [];
    this.villagers = [];
    this.sheepList = [];
    this.sailboats = [];
    this.ducks = [];
    this.balloons = [];
    this.clouds = [];
    this.selectedEntityId = null;
  }

  private restoreFromSerializedSave(save: SerializedWorldSaveV2) {
    this.clearCurrentWorldEntities();
    this.planetName = save.planetName || 'Little Meadow';
    this.dayCount = save.dayCount || 1;
    this.timeMode = save.timeMode || 'auto';
    this.timeOfDay = save.timeOfDay ?? 0.24;
    this.season = save.season || 'spring';
    this.seasonTimer = save.seasonTimer || 0;
    this.weatherPhase = save.weatherPhase || 'clear';
    this.weatherTimer = save.weatherTimer || WEATHER_PHASE_DURATIONS.clear;
    this.weatherOverride = save.weatherOverride ?? null;
    this.reducedMotion = Boolean(save.reducedMotion);
    this.autoReplantEnabled = Boolean(save.autoReplantEnabled);
    this.coins = save.coins;
    this.gardenPoints = save.gardenPoints;
    this.seedsByCrop = { ...save.seedsByCrop };
    this.resources = {
      seeds:
        (save.seedsByCrop.berry || 0) +
        (save.seedsByCrop.wheat || 0) +
        (save.seedsByCrop.pumpkin || 0),
      water: save.resources.water,
      compost: save.resources.compost,
      harvestTotal: save.resources.harvestTotal,
    };
    this.inventory = { ...save.inventory };
    this.stats = { ...save.stats };
    this.completedMilestones = new Set(save.completedMilestones || []);
    this.discoveredCrops = new Set(save.discoveredCrops || ['berry', 'wheat']);
    this.lastSavedAt = save.savedAt || Date.now();

    if (
      Array.isArray(save.terrainRadii) &&
      save.terrainRadii.length === this.terrain.uniqueVertices.length
    ) {
      for (let i = 0; i < save.terrainRadii.length; i++) {
        this.terrain.uniqueVertices[i].radius = save.terrainRadii[i];
      }
    }
    if (
      Array.isArray(save.tilledFacets) &&
      save.tilledFacets.length === this.terrain.facets.length
    ) {
      for (let i = 0; i < save.tilledFacets.length; i++) {
        this.terrain.facets[i].isTilled = Boolean(save.tilledFacets[i]);
      }
    }
    this.terrain.refreshGeometryAndColors();

    for (const po of save.placedObjects) {
      const dir = new THREE.Vector3(po.dir[0], po.dir[1], po.dir[2]).normalize();
      if (po.type === 'plot') {
        const plotEntity = this.placeGardenPlot(
          po.cropType || 'wheat',
          dir,
          po.yaw,
          po.growth,
          po.moisture ?? 0.65,
          Boolean(po.composted),
          false,
          {
            id: po.id,
            hasCrop: po.hasCrop ?? true,
            harvested: Boolean(po.harvested),
            hasCloche: Boolean(po.hasCloche),
          },
        );
        this.updatePlotVisuals(plotEntity);
      } else {
        const entity = this.placeStaticObject(
          po.type,
          dir,
          po.yaw,
          po.removable,
          false,
        );
        entity.id = po.id;
        entity.growth = po.growth;
        entity.targetGrowth = po.targetGrowth;
        entity.isProcessing = Boolean(po.isProcessing);
        entity.productionTimer = po.productionTimer || 0;
        entity.storedOutput = po.storedOutput || 0;
        entity.customTitle = po.customTitle;
        entity.mesh.scale.setScalar(po.growth);
      }
    }

    for (const sv of save.villagers || []) {
      const dir = new THREE.Vector3(sv.dir[0], sv.dir[1], sv.dir[2]).normalize();
      this.spawnVillager(dir, false);
      const created = this.villagers[this.villagers.length - 1];
      if (created) {
        created.id = sv.id;
        created.name = sv.name;
        created.role = sv.role;
        created.assignment = sv.assignment;
        created.yaw = sv.yaw;
      }
    }

    for (const ss of save.sheep || []) {
      const dir = new THREE.Vector3(ss.dir[0], ss.dir[1], ss.dir[2]).normalize();
      this.spawnSheep(dir, false, ss.inPasture);
      const created = this.sheepList[this.sheepList.length - 1];
      if (created) {
        created.id = ss.id;
        created.yaw = ss.yaw;
      }
    }

    // Spawn ambient water & sky life
    this.spawnSailboat(new THREE.Vector3(0.62, -0.14, 0.77).normalize(), false);
    this.spawnSailboat(new THREE.Vector3(-0.66, -0.14, -0.73).normalize(), false);
    this.spawnDuckFlock(new THREE.Vector3(0.52, -0.22, 0.82).normalize(), false);
    this.spawnBalloon(new THREE.Vector3(0.35, 0.52, 0.78).normalize(), false);
    const cloudDirs = [
      new THREE.Vector3(-0.28, 0.38, 0.88).normalize(),
      new THREE.Vector3(0.68, 0.25, -0.68).normalize(),
      new THREE.Vector3(-0.55, -0.48, -0.68).normalize(),
    ];
    cloudDirs.forEach((d, idx) => {
      this.spawnCloud(d, false, 8.0 + idx * 4.0, false);
    });
    this.syncCloudsToSharedWeather();
  }

  public selectFirstEntityOfKind(kind: 'plot' | 'building' | 'villager') {
    this.activeTool = null;
    if (kind === 'plot') {
      const plot = this.placedObjects.find((o) => o.type === 'plot');
      if (plot) this.selectedEntityId = plot.id;
    } else if (kind === 'building') {
      const bld =
        this.placedObjects.find((o) => o.type === 'windmill') ||
        this.placedObjects.find((o) => o.type === 'house');
      if (bld) this.selectedEntityId = bld.id;
    } else if (kind === 'villager') {
      const vil = this.villagers[0];
      if (vil) this.selectedEntityId = vil.id;
    }
    soundEngine.playSelect();
    this.syncWorldStats();
  }

  private resolveVillagerCollisions(
    v: VillagerEntity,
    bridgesAndDocks: PlacedObjectEntity[],
    fallbackDir?: THREE.Vector3,
  ) {
    const villagerRadius = 0.012;

    // 3-pass position-based non-penetration constraint solver
    for (let pass = 0; pass < 3; pass++) {
      // 1. Solid Buildings, Trees, Wells, Campfires, Beehives, Lanterns & Fences
      for (const obj of this.placedObjects) {
        if (obj.type === 'fence') {
          const { segA, segB } = this.getFenceSegmentOnSphere(obj);
          const closest = this.closestPointOnSphereSegment(v.dir, segA, segB);
          const minFenceDist = 0.015 + villagerRadius;
          const dist = v.dir.distanceTo(closest);
          if (dist < minFenceDist) {
            const pushDir =
              dist > 1e-6
                ? v.dir.clone().sub(closest).normalize()
                : v.dir.clone().sub(this.pastureCenter).normalize();
            v.dir
              .copy(closest)
              .addScaledVector(pushDir, minFenceDist + 0.001)
              .normalize();
          }
          continue;
        }

        if (obj.type === 'rainbow') {
          const [footA, footB] = this.getRainbowFootDirs(obj.dir, obj.yaw);
          for (const footDir of [footA, footB]) {
            const minFootDist = 0.028 + villagerRadius;
            const dFoot = v.dir.distanceTo(footDir);
            if (dFoot < minFootDist) {
              const pushDir =
                dFoot > 1e-6
                  ? v.dir.clone().sub(footDir).normalize()
                  : new THREE.Vector3(1, 0, 0);
              v.dir
                .copy(footDir)
                .addScaledVector(pushDir, minFootDist + 0.001)
                .normalize();
            }
          }
          continue;
        }

        const obsR = this.getObjectCollisionRadius(obj.type);
        if (obsR <= 0) continue;

        const minDist = obsR + villagerRadius;
        const dist = v.dir.distanceTo(obj.dir);
        if (dist < minDist) {
          const pushDir =
            dist > 1e-6
              ? v.dir.clone().sub(obj.dir).normalize()
              : new THREE.Vector3(1, 0, 0);
          v.dir
            .copy(obj.dir)
            .addScaledVector(pushDir, minDist + 0.001)
            .normalize();
        }
      }

      // 2. Keep villagers outside the fenced sheep pasture corral
      const dPasture = v.dir.distanceTo(this.pastureCenter);
      const minPastureDist = this.pastureRadius + villagerRadius + 0.006;
      if (dPasture < minPastureDist) {
        const pushOut =
          dPasture > 1e-6
            ? v.dir.clone().sub(this.pastureCenter).normalize()
            : new THREE.Vector3(0, 1, 0);
        v.dir
          .copy(this.pastureCenter)
          .addScaledVector(pushOut, minPastureDist + 0.001)
          .normalize();
      }

      // 3. Villager-to-Villager personal space separation
      for (const other of this.villagers) {
        if (other === v) continue;
        const minSep = 0.020;
        const d = v.dir.distanceTo(other.dir);
        if (d < minSep && d > 1e-6) {
          const push = v.dir.clone().sub(other.dir).normalize();
          const overlap = (minSep - d) * 0.5;
          v.dir.addScaledVector(push, overlap).normalize();
        }
      }

      // 4. Villager-to-Sheep separation
      for (const s of this.sheepList) {
        const minSep = 0.022;
        const d = v.dir.distanceTo(s.dir);
        if (d < minSep && d > 1e-6) {
          const push = v.dir.clone().sub(s.dir).normalize();
          v.dir.addScaledVector(push, minSep - d).normalize();
        }
      }
    }

    // 5. Enforce water & sheer cliff constraints
    const surf = this.terrain.getSurfacePointAndNormal(v.dir);
    const onBridge = bridgesAndDocks.some(
      (b) => b.dir.distanceTo(v.dir) < 0.058,
    );
    const isTooSteep = surf.normal.dot(v.dir) < 0.74;

    if ((surf.isWater && !onBridge) || surf.isMountain || isTooSteep) {
      if (fallbackDir) {
        v.dir.copy(fallbackDir);
      }
      v.targetDir = this.pickNextVillagerTarget(true);
    }
  }

  private resolveSheepCollisions(
    s: SheepEntity,
    fallbackDir?: THREE.Vector3,
  ): boolean {
    const sheepRadius = 0.013;
    let hitBoundary = false;

    for (let pass = 0; pass < 3; pass++) {
      // 1. Continuous Pasture Corral Containment for pasture sheep
      if (s.inPasture) {
        const maxInsideDist = this.pastureRadius - sheepRadius - 0.008;
        const dCenter = s.dir.distanceTo(this.pastureCenter);
        if (dCenter > maxInsideDist && dCenter > 1e-6) {
          const fromCenter = s.dir
            .clone()
            .sub(this.pastureCenter)
            .normalize();
          s.dir
            .copy(this.pastureCenter)
            .addScaledVector(fromCenter, maxInsideDist)
            .normalize();
          hitBoundary = true;
        }
      } else {
        // Free-range sheep outside the corral cannot walk through the fence into the corral
        const minOutsideDist = this.pastureRadius + sheepRadius + 0.008;
        const dCenter = s.dir.distanceTo(this.pastureCenter);
        if (dCenter < minOutsideDist && dCenter > 1e-6) {
          const fromCenter = s.dir
            .clone()
            .sub(this.pastureCenter)
            .normalize();
          s.dir
            .copy(this.pastureCenter)
            .addScaledVector(fromCenter, minOutsideDist)
            .normalize();
          hitBoundary = true;
        }
      }

      // 2. Individual Fence Segment Capsule Colliders & Solid Buildings/Trees
      for (const obj of this.placedObjects) {
        if (obj.type === 'fence') {
          const { segA, segB } = this.getFenceSegmentOnSphere(obj);
          const closest = this.closestPointOnSphereSegment(s.dir, segA, segB);
          const minFenceDist = 0.015 + sheepRadius;
          const dist = s.dir.distanceTo(closest);
          if (dist < minFenceDist) {
            const pushDir =
              dist > 1e-6
                ? s.dir.clone().sub(closest).normalize()
                : this.pastureCenter.clone().sub(closest).normalize();
            s.dir
              .copy(closest)
              .addScaledVector(pushDir, minFenceDist + 0.001)
              .normalize();
            hitBoundary = true;
          }
          continue;
        }

        if (obj.type === 'rainbow') {
          const [footA, footB] = this.getRainbowFootDirs(obj.dir, obj.yaw);
          for (const footDir of [footA, footB]) {
            const minFootDist = 0.028 + sheepRadius;
            const dFoot = s.dir.distanceTo(footDir);
            if (dFoot < minFootDist) {
              const pushDir =
                dFoot > 1e-6
                  ? s.dir.clone().sub(footDir).normalize()
                  : new THREE.Vector3(1, 0, 0);
              s.dir
                .copy(footDir)
                .addScaledVector(pushDir, minFootDist + 0.001)
                .normalize();
              hitBoundary = true;
            }
          }
          continue;
        }

        const obsR = this.getObjectCollisionRadius(obj.type);
        if (obsR <= 0) continue;

        const minDist = obsR + sheepRadius;
        const dist = s.dir.distanceTo(obj.dir);
        if (dist < minDist) {
          const pushDir =
            dist > 1e-6
              ? s.dir.clone().sub(obj.dir).normalize()
              : new THREE.Vector3(1, 0, 0);
          s.dir
            .copy(obj.dir)
            .addScaledVector(pushDir, minDist + 0.001)
            .normalize();
          hitBoundary = true;
        }
      }

      // 3. Sheep-to-Sheep flock separation
      for (const other of this.sheepList) {
        if (other === s) continue;
        const minSep = 0.024;
        const d = s.dir.distanceTo(other.dir);
        if (d < minSep && d > 1e-6) {
          const push = s.dir.clone().sub(other.dir).normalize();
          s.dir.addScaledVector(push, (minSep - d) * 0.5).normalize();
        }
      }
    }

    // 4. Prevent sheep from entering water or steep mountain cliffs
    const surf = this.terrain.getSurfacePointAndNormal(s.dir);
    if (surf.isWater || surf.isMountain || surf.normal.dot(s.dir) < 0.75) {
      if (fallbackDir) {
        s.dir.copy(fallbackDir);
      }
      hitBoundary = true;
    }

    return hitBoundary;
  }

  public dispose() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.timerFrameId !== null) {
      window.clearTimeout(this.timerFrameId);
      this.timerFrameId = null;
    }
    if (this.statusMessageTimer !== null) {
      window.clearTimeout(this.statusMessageTimer);
    }
    this.ambientAudio.dispose();
    if (this.pixelFx) {
      this.pixelFx.dispose();
    }
    const cleanup = (this as unknown as { _cleanup?: () => void })._cleanup;
    if (cleanup) cleanup();
    if (this.renderer) {
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.fallbackCanvas && this.fallbackCanvas.parentNode) {
      this.fallbackCanvas.parentNode.removeChild(this.fallbackCanvas);
      this.fallbackCanvas = null;
    }
  }
}
