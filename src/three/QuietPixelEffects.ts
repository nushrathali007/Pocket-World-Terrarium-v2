/**
 * Adapted from PixelFX (https://github.com/patch-gg/pixelfx)
 *
 * MIT License
 * Copyright (c) 2026 Hugo Duprez
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * Attribution & Provenance Notice:
 * PixelFX is a procedural 2D visual effects engine created by Hugo Duprez,
 * originally developed for Sprite Fusion (https://www.spritefusion.com) and
 * Patch (https://www.patch.gg).
 */

import * as THREE from 'three';
import { SeasonId } from '../config/farmConfig';

// ============================================================================
// PixelFX Core Runtime (TypeScript Adaptation)
// ============================================================================

const TRANSPARENT = 0;

function pack(r: number, g: number, b: number): number {
  return (
    0xff000000 |
    ((b & 0xff) << 16) |
    ((g & 0xff) << 8) |
    (r & 0xff)
  ) >>> 0;
}

function rgb(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return pack(r, g, b);
}

function unpack(c: number): [number, number, number] {
  return [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff];
}

function lerpColor(c1: number, c2: number, t: number): number {
  if (t <= 0) return c1;
  if (t >= 1) return c2;
  const r1 = c1 & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = (c1 >> 16) & 0xff;
  const r2 = c2 & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = (c2 >> 16) & 0xff;
  return pack(
    (r1 + (r2 - r1) * t + 0.5) | 0,
    (g1 + (g2 - g1) * t + 0.5) | 0,
    (b1 + (b2 - b1) * t + 0.5) | 0,
  );
}

function addColor(c1: number, c2: number, k = 1): number {
  if (c1 === TRANSPARENT) return c2;
  if (c2 === TRANSPARENT) return c1;
  const r = Math.min(255, (c1 & 0xff) + (((c2 & 0xff) * k) | 0));
  const g = Math.min(
    255,
    ((c1 >> 8) & 0xff) + ((((c2 >> 8) & 0xff) * k) | 0),
  );
  const b = Math.min(
    255,
    ((c1 >> 16) & 0xff) + ((((c2 >> 16) & 0xff) * k) | 0),
  );
  return pack(r, g, b);
}

const TAU = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = (seed | 0) || 1;
  }
  next(): number {
    let s = this.s | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s;
    return (s >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(a: number, b: number): number {
    return (a + this.next() * (b - a + 1)) | 0;
  }
  chance(p = 0.5): boolean {
    return this.next() < p;
  }
}

interface PixelFrame {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly color: Uint32Array;
  readonly light: Uint32Array;
}

function createFrame(w: number, h: number, ox = w >> 1, oy = h >> 1): PixelFrame {
  return {
    w,
    h,
    ox,
    oy,
    color: new Uint32Array(w * h),
    light: new Uint32Array(w * h),
  };
}

function clearFrame(f: PixelFrame): void {
  f.color.fill(0);
  f.light.fill(0);
}

class Painter {
  w = 0;
  h = 0;
  ox = 0;
  oy = 0;
  color!: Uint32Array;
  light!: Uint32Array;

  bind(f: PixelFrame): this {
    this.w = f.w;
    this.h = f.h;
    this.ox = f.ox;
    this.oy = f.oy;
    this.color = f.color;
    this.light = f.light;
    return this;
  }

  px(x: number, y: number, c: number): void {
    if (c === TRANSPARENT) return;
    const ix = (x + this.ox) | 0;
    const iy = (y + this.oy) | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    this.color[iy * this.w + ix] = c;
  }

  pxUnder(x: number, y: number, c: number): void {
    if (c === TRANSPARENT) return;
    const ix = (x + this.ox) | 0;
    const iy = (y + this.oy) | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const i = iy * this.w + ix;
    if (this.color[i] === TRANSPARENT) this.color[i] = c;
  }

  blend(x: number, y: number, c: number, t = 0.5): void {
    if (c === TRANSPARENT || t <= 0) return;
    const ix = (x + this.ox) | 0;
    const iy = (y + this.oy) | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const i = iy * this.w + ix;
    const cur = this.color[i];
    this.color[i] = cur === TRANSPARENT ? c : lerpColor(cur, c, t);
  }

  dot(x: number, y: number, size: number, c: number): void {
    if (c === TRANSPARENT || size <= 0) return;
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (size <= 1.2) {
      this.px(ix, iy, c);
      return;
    }
    if (size <= 1.9) {
      this.px(ix, iy, c);
      this.px(ix + 1, iy, c);
      this.px(ix, iy + 1, c);
      this.px(ix + 1, iy + 1, c);
      return;
    }
    if (size <= 2.6) {
      this.px(ix, iy, c);
      this.px(ix - 1, iy, c);
      this.px(ix + 1, iy, c);
      this.px(ix, iy - 1, c);
      this.px(ix, iy + 1, c);
      return;
    }
    this.circle(ix, iy, (size * 0.5) | 0, c);
  }

  circle(cx: number, cy: number, r: number, c: number): void {
    if (c === TRANSPARENT || r < 0) return;
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    if (r === 0) {
      this.px(cx, cy, c);
      return;
    }
    const r2 = r * r + r * 0.6;
    for (let dy = -r; dy <= r; dy++) {
      const y2 = dy * dy;
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + y2 <= r2) this.px(cx + dx, cy + dy, c);
      }
    }
  }

  ring(cx: number, cy: number, r: number, c: number, thickness = 1): void {
    if (c === TRANSPARENT || r < 0) return;
    cx = Math.round(cx);
    cy = Math.round(cy);
    if (r < 1) {
      this.px(cx, cy, c);
      return;
    }
    const rOut = r + (thickness - 1) * 0.5;
    const rIn = Math.max(0, r - thickness * 0.5 - 0.35);
    const ro2 = rOut * rOut + rOut * 0.5;
    const ri2 = rIn * rIn - rIn * 0.4;
    const R = Math.ceil(rOut);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) this.px(cx + dx, cy + dy, c);
      }
    }
  }

  glow(cx: number, cy: number, r: number, c: number, intensity = 1): void {
    if (r <= 0 || intensity <= 0) return;
    const [cr, cg, cb] = unpack(c);
    const R = Math.ceil(r);
    const invR = 1 / r;
    const w = this.w;
    const h = this.h;
    const ox = this.ox;
    const oy = this.oy;
    const buf = this.light;
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const x0 = Math.max(0, icx - R + ox);
    const x1 = Math.min(w - 1, icx + R + ox);
    const y0 = Math.max(0, icy - R + oy);
    const y1 = Math.min(h - 1, icy + R + oy);
    for (let py = y0; py <= y1; py++) {
      const dy = py - oy - cy;
      const dy2 = dy * dy;
      const row = py * w;
      for (let px = x0; px <= x1; px++) {
        const dx = px - ox - cx;
        const d = Math.sqrt(dx * dx + dy2) * invR;
        if (d >= 1) continue;
        let fall = 1 - d;
        fall = fall * fall * intensity;
        const idx = row + px;
        const cur = buf[idx];
        const nr = Math.min(255, (cur & 0xff) + ((cr * fall) | 0));
        const ng = Math.min(255, ((cur >> 8) & 0xff) + ((cg * fall) | 0));
        const nb = Math.min(255, ((cur >> 16) & 0xff) + ((cb * fall) | 0));
        buf[idx] = pack(nr, ng, nb);
      }
    }
  }
}

class Lights {
  private data = new Float32Array(256 * 5);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  add(x: number, y: number, r: number, color: number, intensity = 1): void {
    if (this.count >= 256 || r <= 0 || intensity <= 0) return;
    const b = this.count * 5;
    const d = this.data;
    d[b] = x;
    d[b + 1] = y;
    d[b + 2] = r;
    d[b + 3] = color;
    d[b + 4] = intensity;
    this.count++;
  }

  apply(p: Painter): void {
    const d = this.data;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const b = i * 5;
      p.glow(d[b], d[b + 1], d[b + 2], d[b + 3], d[b + 4]);
    }
  }
}

function composite(
  frame: PixelFrame,
  out: Uint8ClampedArray,
  lightK = 0.72,
): void {
  const { w, h, color, light } = frame;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    let c = color[i];
    const l = light[i];
    const j = i << 2;
    if (c === TRANSPARENT && l === 0) {
      out[j] = 0;
      out[j + 1] = 0;
      out[j + 2] = 0;
      out[j + 3] = 0;
      continue;
    }
    if (c === TRANSPARENT) {
      // Soft additive glow pixel with gentle alpha
      const lr = l & 0xff;
      const lg = (l >> 8) & 0xff;
      const lb = (l >> 16) & 0xff;
      const maxCh = Math.max(lr, lg, lb);
      out[j] = lr;
      out[j + 1] = lg;
      out[j + 2] = lb;
      out[j + 3] = Math.min(210, (maxCh * lightK * 0.95) | 0);
      continue;
    }
    if (l !== 0) {
      c = addColor(c, l, lightK);
    }
    out[j] = c & 0xff;
    out[j + 1] = (c >> 8) & 0xff;
    out[j + 2] = (c >> 16) & 0xff;
    out[j + 3] = 242;
  }
}

// ============================================================================
// Adapted Quiet Palettes (Muted Terrarium Tones, No Pure White Flashes)
// ============================================================================

const RIPPLE_PALETTE = {
  deep: rgb(0x2d5e66),
  mid: rgb(0x4b878f),
  light: rgb(0x7cb2b8),
  foam: rgb(0xb8dce0),
  cream: rgb(0xe8e2d3),
};

const COLLECT_PALETTE = {
  deepSage: rgb(0x527a57),
  warmSage: rgb(0x88b37e),
  honeyGold: rgb(0xd9b25f),
  softGold: rgb(0xebd294),
  warmCream: rgb(0xf3ebd9),
};

const FIREFLY_PALETTE = {
  warmCore: rgb(0xf5e8b8),
  amberGlow: rgb(0xdec068),
  mossHalo: rgb(0x8fae63),
  dimTail: rgb(0x56693d),
};

const BLOSSOM_PALETTE = [
  rgb(0xd48a9c),
  rgb(0xe3a8b7),
  rgb(0xefc5cf),
  rgb(0xf5dfe3),
  rgb(0xf7ecee),
];

const AUTUMN_PALETTE = [
  rgb(0x8a3a22),
  rgb(0xb55328),
  rgb(0xd47a32),
  rgb(0xe3a344),
  rgb(0xc7923e),
];

// ============================================================================
// 1. Water & Soil Ripple Instance (Adapted from src/fx/water/ripples.js)
// ============================================================================

export type RippleStyle = 'soil' | 'water' | 'boat';

interface RippleRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  delay: number;
}

interface RippleDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  col: number;
}

class PixelRippleEffect {
  readonly frame: PixelFrame;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly imgData: ImageData;
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  private painter = new Painter();
  private rings: RippleRing[] = [];
  private droplets: RippleDroplet[] = [];
  private age = 0;
  private duration: number;
  private style: RippleStyle;

  constructor(style: RippleStyle, worldScale: number) {
    this.style = style;
    const size = 56;
    this.frame = createFrame(size, size);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.imgData = this.ctx.createImageData(size, size);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    const geo = new THREE.PlaneGeometry(worldScale, worldScale);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 6;

    const rng = new Rng(((Math.random() * 99999) | 0) + 17);

    if (style === 'soil') {
      // Gentle watering-can droplet splash + 2 subtle moisture rings (no dark water disc)
      this.duration = 1.05;
      this.rings.push(
        { x: 0, y: 0, r: 1.5, maxR: 15, life: 0, maxLife: 0.72, delay: 0 },
        { x: 0, y: 0, r: 1, maxR: 11, life: 0, maxLife: 0.65, delay: 0.14 },
      );
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + rng.range(-0.2, 0.2);
        const sp = rng.range(10, 21);
        this.droplets.push({
          x: Math.cos(a) * 2,
          y: Math.sin(a) * 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - rng.range(4, 9),
          life: 0,
          maxLife: rng.range(0.35, 0.58),
          col: i % 2 === 0 ? RIPPLE_PALETTE.cream : RIPPLE_PALETTE.foam,
        });
      }
    } else if (style === 'boat') {
      this.duration = 1.35;
      this.rings.push(
        { x: 0, y: 0, r: 2, maxR: 21, life: 0, maxLife: 1.0, delay: 0 },
        { x: 0, y: 0, r: 1.5, maxR: 16, life: 0, maxLife: 0.88, delay: 0.18 },
        { x: 0, y: 0, r: 1, maxR: 11, life: 0, maxLife: 0.75, delay: 0.34 },
      );
    } else {
      // Ambient pond/lake concentric ripple
      this.duration = 1.6;
      this.rings.push(
        { x: 0, y: 0, r: 1, maxR: 18, life: 0, maxLife: 1.25, delay: 0 },
        { x: 0, y: 0, r: 1, maxR: 13, life: 0, maxLife: 1.05, delay: 0.28 },
      );
    }

    this.renderStep(0.016);
  }

  renderStep(dt: number): boolean {
    this.age += dt;
    if (this.age >= this.duration) return false;

    clearFrame(this.frame);
    const p = this.painter.bind(this.frame);

    for (const ring of this.rings) {
      if (this.age < ring.delay) continue;
      ring.life += dt;
      const t = clamp(ring.life / ring.maxLife, 0, 1);
      if (t >= 1) continue;

      const curR = 1.5 + (ring.maxR - 1.5) * (1 - Math.pow(1 - t, 1.65));
      let col = RIPPLE_PALETTE.foam;
      if (t > 0.72) col = RIPPLE_PALETTE.deep;
      else if (t > 0.42) col = RIPPLE_PALETTE.mid;
      else if (t > 0.18) col = RIPPLE_PALETTE.light;
      else col = this.style === 'soil' ? RIPPLE_PALETTE.cream : RIPPLE_PALETTE.foam;

      // Draw slightly broken pixel ring near the end of its life for organic fade
      if (t < 0.78) {
        p.ring(ring.x, ring.y, curR, col, 1);
      } else {
        const steps = Math.max(12, Math.round(curR * 4));
        for (let s = 0; s < steps; s += 2) {
          const ang = (s / steps) * TAU;
          p.px(
            Math.round(ring.x + Math.cos(ang) * curR),
            Math.round(ring.y + Math.sin(ang) * curR),
            col,
          );
        }
      }
    }

    for (const d of this.droplets) {
      d.life += dt;
      if (d.life >= d.maxLife) continue;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 28 * dt;
      const t = d.life / d.maxLife;
      const col = t < 0.5 ? d.col : RIPPLE_PALETTE.light;
      p.px(Math.round(d.x), Math.round(d.y), col);
    }

    composite(this.frame, this.imgData.data, 0.55);
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}

// ============================================================================
// 2. Quiet Collect Burst (Adapted from src/fx/pickups/collect-burst.js)
//    - Opening full-frame flash & cross flare removed
//    - Hard-coded WHITE replaced with warm cream, soft gold, and sage
// ============================================================================

interface CollectMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  life: number;
  maxLife: number;
  size: number;
  twinklePhase: number;
  col: number;
}

class PixelCollectBurstEffect {
  readonly frame: PixelFrame;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly imgData: ImageData;
  readonly texture: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;
  private painter = new Painter();
  private lights = new Lights();
  private motes: CollectMote[] = [];
  private age = 0;
  private readonly duration = 0.85;
  private ringRadius = 1.5;

  constructor(worldScale = 0.23) {
    const size = 56;
    this.frame = createFrame(size, size);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.imgData = this.ctx.createImageData(size, size);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(worldScale, worldScale, 1);
    this.sprite.renderOrder = 6;

    const rng = new Rng(((Math.random() * 99999) | 0) + 43);
    const count = 11;
    const palette = [
      COLLECT_PALETTE.warmCream,
      COLLECT_PALETTE.softGold,
      COLLECT_PALETTE.honeyGold,
      COLLECT_PALETTE.warmSage,
    ];

    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng.range(-0.22, 0.22);
      const sp = rng.range(16, 34);
      this.motes.push({
        x: Math.cos(a) * 1.5,
        y: Math.sin(a) * 1.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rng.range(4, 11),
        px: 0,
        py: 0,
        life: 0,
        maxLife: rng.range(0.45, 0.78),
        size: rng.chance(0.35) ? 2 : 1,
        twinklePhase: rng.range(0, TAU),
        col: palette[i % palette.length],
      });
    }

    this.renderStep(0.016);
  }

  renderStep(dt: number): boolean {
    this.age += dt;
    if (this.age >= this.duration) return false;

    clearFrame(this.frame);
    this.lights.clear();
    const p = this.painter.bind(this.frame);

    // Expanding soft ring
    const ringT = clamp(this.age / 0.48, 0, 1);
    if (ringT < 1) {
      this.ringRadius = 2 + ringT * 14;
      const ringCol =
        ringT < 0.45
          ? COLLECT_PALETTE.warmCream
          : ringT < 0.75
            ? COLLECT_PALETTE.softGold
            : COLLECT_PALETTE.warmSage;
      p.ring(0, 0, this.ringRadius, ringCol, 1);
    }

    // Gentle center warm glow (subtle, never harsh white)
    if (this.age < 0.35) {
      const k = (1 - this.age / 0.35) * 0.45;
      this.lights.add(0, 0, 9, COLLECT_PALETTE.softGold, k);
    }

    for (const m of this.motes) {
      m.life += dt;
      if (m.life >= m.maxLife) continue;
      m.px = m.x;
      m.py = m.y;
      m.vx *= Math.pow(0.14, dt);
      m.vy *= Math.pow(0.14, dt);
      m.vy -= 6 * dt; // Slight upward float
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      const t = m.life / m.maxLife;
      const twinkle = 0.5 + 0.5 * Math.sin(this.age * 16 + m.twinklePhase);
      const col =
        t > 0.72
          ? COLLECT_PALETTE.deepSage
          : twinkle > 0.65
            ? COLLECT_PALETTE.warmCream
            : m.col;

      p.px(Math.round(m.px), Math.round(m.py), COLLECT_PALETTE.warmSage);
      p.dot(m.x, m.y, t < 0.5 ? m.size : 1, col);

      if (t < 0.6) {
        this.lights.add(m.x, m.y, 4, COLLECT_PALETTE.honeyGold, (1 - t) * 0.28);
      }
    }

    this.lights.apply(p);
    composite(this.frame, this.imgData.data, 0.55);
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}

// ============================================================================
// 3. Dusk/Night Firefly Cluster (Adapted from src/fx/weather/fireflies.js)
//    - Uses PixelFX wandering + pulsing logic without meadow/sky backdrop
// ============================================================================

interface FireflyAgent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  retargetTimer: number;
  phase: number;
  pulseSpeed: number;
  trailX: number[];
  trailY: number[];
}

class PixelFireflyCluster {
  readonly frame: PixelFrame;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly imgData: ImageData;
  readonly texture: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;
  readonly baseDir: THREE.Vector3;
  readonly baseHeight: number;
  readonly driftPhase: number;
  private painter = new Painter();
  private lights = new Lights();
  private flies: FireflyAgent[] = [];
  private rng: Rng;
  private clock = 0;

  constructor(seed: number, baseDir: THREE.Vector3, baseHeight: number) {
    this.rng = new Rng(seed);
    this.baseDir = baseDir.clone().normalize();
    this.baseHeight = baseHeight;
    this.driftPhase = this.rng.range(0, TAU);

    const size = 48;
    this.frame = createFrame(size, size);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.imgData = this.ctx.createImageData(size, size);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 0,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(0.26, 0.26, 1);
    this.sprite.renderOrder = 6;

    for (let i = 0; i < 3; i++) {
      const x = this.rng.range(-12, 12);
      const y = this.rng.range(-12, 12);
      this.flies.push({
        x,
        y,
        vx: 0,
        vy: 0,
        tx: this.rng.range(-14, 14),
        ty: this.rng.range(-14, 14),
        retargetTimer: this.rng.range(0.4, 1.4),
        phase: this.rng.range(0, TAU),
        pulseSpeed: this.rng.range(2.2, 3.6),
        trailX: [x, x, x],
        trailY: [y, y, y],
      });
    }
  }

  step(dt: number, visibility: number): void {
    this.clock += dt;
    this.sprite.visible = visibility > 0.03;
    if (!this.sprite.visible) return;
    (this.sprite.material as THREE.SpriteMaterial).opacity = visibility * 0.92;

    clearFrame(this.frame);
    this.lights.clear();
    const p = this.painter.bind(this.frame);

    for (const f of this.flies) {
      f.retargetTimer -= dt;
      if (f.retargetTimer <= 0) {
        f.tx = this.rng.range(-15, 15);
        f.ty = this.rng.range(-14, 14);
        f.retargetTimer = this.rng.range(0.7, 1.8);
      }

      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      f.vx += dx * 2.8 * dt;
      f.vy += dy * 2.8 * dt;
      const damp = Math.pow(0.18, dt);
      f.vx *= damp;
      f.vy *= damp;

      f.trailX.pop();
      f.trailY.pop();
      f.trailX.unshift(f.x);
      f.trailY.unshift(f.y);

      f.x = clamp(f.x + f.vx * dt, -18, 18);
      f.y = clamp(f.y + f.vy * dt, -18, 18);
      f.phase += f.pulseSpeed * dt;

      const s = 0.5 + 0.5 * Math.sin(f.phase);
      const pulse = s * s * (3 - 2 * s); // Smoothstep pulse

      if (pulse > 0.25) {
        p.px(
          Math.round(f.trailX[1]),
          Math.round(f.trailY[1]),
          FIREFLY_PALETTE.dimTail,
        );
      }
      if (pulse > 0.12) {
        const coreCol =
          pulse > 0.65 ? FIREFLY_PALETTE.warmCore : FIREFLY_PALETTE.amberGlow;
        p.px(Math.round(f.x), Math.round(f.y), coreCol);
        if (pulse > 0.55) {
          p.pxUnder(Math.round(f.x) + 1, Math.round(f.y), FIREFLY_PALETTE.mossHalo);
          p.pxUnder(Math.round(f.x) - 1, Math.round(f.y), FIREFLY_PALETTE.mossHalo);
        }
        this.lights.add(
          f.x,
          f.y,
          4 + pulse * 5,
          FIREFLY_PALETTE.amberGlow,
          0.25 + pulse * 0.55,
        );
      }
    }

    this.lights.apply(p);
    composite(this.frame, this.imgData.data, 0.68);
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}

// ============================================================================
// 4 & 5. Seasonal Tree Petals & Leaves
//        Adapted from src/fx/weather/cherry-blossoms.js & falling-leaves.js
//        (No sky/forest backdrop or persistent ground litter)
// ============================================================================

interface SeasonalFoliageParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  swayPhase: number;
  swaySpeed: number;
  flipPhase: number;
  flipSpeed: number;
  toneIdx: number;
}

class PixelSeasonalCanopyEmitter {
  readonly frame: PixelFrame;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly imgData: ImageData;
  readonly texture: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;
  readonly anchorPos: THREE.Vector3;
  private painter = new Painter();
  private particles: SeasonalFoliageParticle[] = [];
  private rng: Rng;
  private clock = 0;

  constructor(seed: number, anchorPos: THREE.Vector3) {
    this.rng = new Rng(seed);
    this.anchorPos = anchorPos.clone();

    const size = 56;
    this.frame = createFrame(size, size);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.imgData = this.ctx.createImageData(size, size);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(0.32, 0.32, 1);
    this.sprite.position.copy(anchorPos);
    this.sprite.renderOrder = 6;

    for (let i = 0; i < 6; i++) {
      this.particles.push(this.spawnParticle(true));
    }
  }

  private spawnParticle(randomY: boolean): SeasonalFoliageParticle {
    return {
      x: this.rng.range(-16, 14),
      y: randomY ? this.rng.range(-20, 18) : this.rng.range(-22, -14),
      vx: this.rng.range(2.5, 6.5),
      vy: this.rng.range(6.5, 11.5),
      swayPhase: this.rng.range(0, TAU),
      swaySpeed: this.rng.range(2.2, 4.0),
      flipPhase: this.rng.range(0, TAU),
      flipSpeed: this.rng.range(3.5, 6.2),
      toneIdx: this.rng.int(1, 3),
    };
  }

  step(dt: number, season: SeasonId): void {
    const active = season === 'spring' || season === 'autumn';
    this.sprite.visible = active;
    if (!active) return;

    this.clock += dt;
    clearFrame(this.frame);
    const p = this.painter.bind(this.frame);
    const pal = season === 'spring' ? BLOSSOM_PALETTE : AUTUMN_PALETTE;

    const gust = Math.sin(this.clock * 1.4) * 3.2;

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      pt.swayPhase += pt.swaySpeed * dt;
      pt.flipPhase += pt.flipSpeed * dt;

      const pendulum = Math.sin(pt.swayPhase) * (season === 'autumn' ? 8.5 : 5.5);
      pt.x += (pt.vx + gust + pendulum) * dt;
      pt.y += (pt.vy - Math.abs( Math.sin(pt.swayPhase) ) * 2.2) * dt;

      if (pt.y > 22 || pt.x > 24 || pt.x < -24) {
        this.particles[i] = this.spawnParticle(false);
        continue;
      }

      const ix = Math.round(pt.x);
      const iy = Math.round(pt.y);
      const flip = Math.sin(pt.flipPhase);
      const colMain = pal[pt.toneIdx];
      const colHi = pal[Math.min(pal.length - 1, pt.toneIdx + 1)];
      const colLo = pal[Math.max(0, pt.toneIdx - 1)];

      if (season === 'spring') {
        // Delicate 2-3 pixel blossom petal
        p.px(ix, iy, colMain);
        if (Math.abs(flip) > 0.35) {
          p.px(ix + (flip > 0 ? 1 : -1), iy, colHi);
          p.px(ix, iy + 1, colLo);
        } else {
          p.px(ix, iy + 1, colHi);
        }
      } else {
        // Tumbling 3-4 pixel autumn leaf
        p.px(ix, iy, colMain);
        if (Math.abs(flip) > 0.4) {
          p.px(ix + 1, iy, colHi);
          p.px(ix - 1, iy + 1, colLo);
          p.px(ix, iy + 1, colMain);
        } else {
          p.px(ix + 1, iy + 1, colLo);
        }
      }
    }

    composite(this.frame, this.imgData.data, 0.45);
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}

// ============================================================================
// QuietPixelEffectsCoordinator (Manages World-Space Pixel Effects at ~18 FPS)
// ============================================================================

export class QuietPixelEffectsCoordinator {
  private readonly root: THREE.Group;
  private ripples: PixelRippleEffect[] = [];
  private bursts: PixelCollectBurstEffect[] = [];
  private fireflies: PixelFireflyCluster[] = [];
  private canopyEmitters: PixelSeasonalCanopyEmitter[] = [];
  private stepAccumulator = 0;
  private ambientRippleTimer = 2.4;
  private readonly stepInterval = 1 / 18; // Crisp ~18 fps pixel animation cadence
  private readonly dummyUp = new THREE.Vector3(0, 1, 0);
  private readonly dummyQuat = new THREE.Quaternion();

  constructor(planetRoot: THREE.Group, baseRadius: number) {
    this.root = new THREE.Group();
    this.root.name = 'QuietPixelEffectsRoot';
    planetRoot.add(this.root);

    // Initialize 10 dusk/night firefly clusters distributed around the planet
    for (let i = 0; i < 10; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 10);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      ).normalize();
      const cluster = new PixelFireflyCluster(
        1000 + i * 79,
        dir,
        baseRadius + 0.13 + (i % 3) * 0.035,
      );
      cluster.sprite.position.copy(dir).multiplyScalar(cluster.baseHeight);
      this.root.add(cluster.sprite);
      this.fireflies.push(cluster);
    }
  }

  /**
   * Spawns a gentle water or soil watering ripple aligned to the local surface normal.
   */
  public spawnRipple(
    worldPos: THREE.Vector3,
    normal: THREE.Vector3,
    style: RippleStyle = 'soil',
  ): void {
    // Limit simultaneous active ripples to keep visual peace
    if (this.ripples.length >= 8) {
      const oldest = this.ripples.shift()!;
      this.root.remove(oldest.mesh);
      oldest.dispose();
    }

    const scale = style === 'soil' ? 0.22 : style === 'boat' ? 0.25 : 0.21;
    const ripple = new PixelRippleEffect(style, scale);
    ripple.mesh.position.copy(worldPos).addScaledVector(normal, 0.006);
    this.dummyQuat.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal.clone().normalize(),
    );
    ripple.mesh.quaternion.copy(this.dummyQuat);

    this.root.add(ripple.mesh);
    this.ripples.push(ripple);
  }

  /**
   * Spawns a warm cream/gold/sage collection burst above a harvested crop or collected goods.
   */
  public spawnCollectBurst(
    worldPos: THREE.Vector3,
    normal: THREE.Vector3,
    worldScale = 0.23,
  ): void {
    if (this.bursts.length >= 6) {
      const oldest = this.bursts.shift()!;
      this.root.remove(oldest.sprite);
      oldest.dispose();
    }

    const burst = new PixelCollectBurstEffect(worldScale);
    burst.sprite.position.copy(worldPos).addScaledVector(normal, 0.11);
    this.root.add(burst.sprite);
    this.bursts.push(burst);
  }

  /**
   * Synchronizes seasonal canopy emitters with current deciduous/oak tree positions.
   */
  public syncTreeCanopies(treeAnchors: THREE.Vector3[]): void {
    // Rebuild only if count changed significantly
    if (Math.abs(this.canopyEmitters.length - treeAnchors.length) <= 1 && this.canopyEmitters.length > 0) {
      return;
    }
    for (const em of this.canopyEmitters) {
      this.root.remove(em.sprite);
      em.dispose();
    }
    this.canopyEmitters = [];

    const maxEmitters = Math.min(8, treeAnchors.length);
    for (let i = 0; i < maxEmitters; i++) {
      const emitter = new PixelSeasonalCanopyEmitter(400 + i * 97, treeAnchors[i]);
      this.root.add(emitter.sprite);
      this.canopyEmitters.push(emitter);
    }
  }

  public update(
    dt: number,
    elapsed: number,
    options: {
      nightFactor: number;
      twilightFactor: number;
      season: SeasonId;
      isRaining: boolean;
      sampleWaterSurfacePoint?: () => { pos: THREE.Vector3; normal: THREE.Vector3 } | null;
    },
  ): void {
    // Gently bob firefly cluster world positions continuously for smooth motion
    const fireflyVisibility = clamp(
      Math.max(options.nightFactor * 0.95, options.twilightFactor * 0.65) *
        (options.isRaining ? 0.35 : 1),
      0,
      1,
    );
    if (fireflyVisibility > 0.03) {
      for (const ff of this.fireflies) {
        const bob = Math.sin(elapsed * 1.1 + ff.driftPhase) * 0.025;
        ff.sprite.position
          .copy(ff.baseDir)
          .multiplyScalar(ff.baseHeight + bob);
      }
    } else {
      for (const ff of this.fireflies) {
        ff.sprite.visible = false;
      }
    }

    // Sparse ambient water ripples (faster during gentle rain)
    this.ambientRippleTimer -= dt * (options.isRaining ? 2.6 : 1.0);
    if (this.ambientRippleTimer <= 0 && options.sampleWaterSurfacePoint) {
      this.ambientRippleTimer = options.isRaining
        ? 0.65 + Math.random() * 0.8
        : 2.2 + Math.random() * 2.5;
      const sample = options.sampleWaterSurfacePoint();
      if (sample) {
        this.spawnRipple(sample.pos, sample.normal, 'water');
      }
    }

    // Step pixel buffers at ~18 FPS
    this.stepAccumulator += dt;
    if (this.stepAccumulator < this.stepInterval) return;
    const stepDt = Math.min(0.1, this.stepAccumulator);
    this.stepAccumulator = 0;

    // 1. Update one-shot ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const alive = this.ripples[i].renderStep(stepDt);
      if (!alive) {
        const done = this.ripples[i];
        this.root.remove(done.mesh);
        done.dispose();
        this.ripples.splice(i, 1);
      }
    }

    // 2. Update collection bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const alive = this.bursts[i].renderStep(stepDt);
      if (!alive) {
        const done = this.bursts[i];
        this.root.remove(done.sprite);
        done.dispose();
        this.bursts.splice(i, 1);
      }
    }

    // 3. Update firefly clusters
    if (fireflyVisibility > 0.03) {
      for (const ff of this.fireflies) {
        ff.step(stepDt, fireflyVisibility);
      }
    }

    // 4. Update spring cherry blossoms / autumn falling leaves
    for (const em of this.canopyEmitters) {
      em.step(stepDt, options.season);
    }
  }

  public dispose(): void {
    for (const r of this.ripples) {
      this.root.remove(r.mesh);
      r.dispose();
    }
    for (const b of this.bursts) {
      this.root.remove(b.sprite);
      b.dispose();
    }
    for (const f of this.fireflies) {
      this.root.remove(f.sprite);
      f.dispose();
    }
    for (const c of this.canopyEmitters) {
      this.root.remove(c.sprite);
      c.dispose();
    }
    this.ripples = [];
    this.bursts = [];
    this.fireflies = [];
    this.canopyEmitters = [];
  }
}
