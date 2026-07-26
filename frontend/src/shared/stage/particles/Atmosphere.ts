/**
 * Atmosphere Particles（Phase 2 VS6 Spec §氛围粒子）。
 *
 * 设计目标：
 *  - **纯数据 + FSM**：粒子位置 / 寿命 / 颜色都存在 `AtmosphereParticle`
 *    数组里；`tick(deltaMs, now)` 推进；渲染层（Phaser 4 Particles /
 *    DOM / Canvas）按 snapshot 读。
 *  - **publicState 驱动**：density（粒子数倍率）+ visibility（白天 / 夜晚）
 *    从 timeOfDay / weather 派生；同一状态幂等。
 *  - **缺 WebGL 优雅降级**：粒子逻辑跟 WebGL 无关；渲染层无 WebGL 时
 *    也可走 DOM（CSS animations）路径 — pipeline 仅暴露 snapshot。
 *  - **不依赖 Phaser**：与 VS4/VS5 一致；可被 SSR / 单测直接构造。
 *
 * 数据模型：
 *  - `AtmosphereSpec`：emitter 描述（kind / area / count / drift / lifetime）
 *  - `AtmosphereLayerSpec`：emitters 数组（地图级别）
 *  - `AtmosphereParticle`：运行时单粒子（id / position / velocity / age / lifetime）
 *  - `AtmosphereSnapshot`：渲染层读的所有信息（含 density / visibility）
 */
import type { WorldEntityPublicState } from '@shared/api';
import {
  readTimeOfDay,
  readWeather,
  type TimeOfDayBand,
  type WeatherBand,
} from '@shared/stage/lighting';

// ───────── types ─────────

export type AtmosphereKind = 'dust' | 'smoke' | 'spark' | 'firefly' | 'ember';

/** 颜色：RGBA（线性 [0, 1]）。 */
export type AtmosphereColor = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
};

/**
 * 单个 emitter（来自大气配置 JSON / 内置常量）。
 *
 *  - `kind`：决定颜色 / 寿命 / 漂移模式
 *  - `area`：emitter 所在 tile 区域（与 WorldEntity.position 同坐标系）
 *  - `count`：静态上限（运行时按 `density` 缩放）
 *  - `drift`：可选，固定漂移方向 + 随机抖动幅度
 *  - `lifetimeMs`：可选，单粒子寿命；缺省按 kind 推断
 */
export type AtmosphereSpec = {
  readonly kind: AtmosphereKind;
  readonly area: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly count: number;
  readonly color: AtmosphereColor;
  readonly drift?: { readonly dx: number; readonly dy: number; readonly variance: number };
  readonly lifetimeMs?: number;
  /**
   * 可选 anchor：emitter 绑定到某个 tile 上的固定物（灯笼 / 灶台）。
   * 给 anchor 时 area.h/w 失效，emitter 从 anchor 中心扩散。
   */
  readonly anchor?: { readonly x: number; readonly y: number };
};

export type AtmosphereLayerSpec = {
  readonly mapId: string | null;
  readonly emitters: readonly AtmosphereSpec[];
};

/** 单粒子运行时状态。 */
export type AtmosphereParticle = {
  readonly id: number;
  readonly emitterIndex: number;
  readonly kind: AtmosphereKind;
  readonly position: { readonly x: number; readonly y: number };
  readonly velocity: { readonly dx: number; readonly dy: number };
  readonly age: number;
  readonly lifetime: number;
  readonly color: AtmosphereColor;
};

/**
 * 渲染层用的快照：含 density / visibility / 当前所有粒子。
 */
export type AtmosphereSnapshot = {
  readonly mapId: string | null;
  readonly specVersion: number;
  readonly emitters: readonly AtmosphereSpec[];
  readonly particles: readonly AtmosphereParticle[];
  readonly density: number;
  readonly visibility: number;
  readonly timeOfDay: TimeOfDayBand;
  readonly weather: WeatherBand;
};

// ───────── defaults ─────────

/**
 * 单一 kind 的默认寿命 / 漂移 / 颜色。
 *
 * 设计意图：
 *  - dust：长寿命、慢漂（白天室内空气流动）
 *  - smoke：中等寿命、向上漂（灶台 / 炊烟）
 *  - spark：短寿命、快速（灶火 / 烟花）
 *  - firefly：长寿命、轻微漂浮（夜间灯笼萤）
 *  - ember：中等寿命、向上飘（余烬）
 */
export const DEFAULT_KIND_TUNING: Readonly<
  Record<
    AtmosphereKind,
    {
      lifetimeMs: number;
      drift: { dx: number; dy: number; variance: number };
      color: AtmosphereColor;
    }
  >
> = Object.freeze({
  dust: Object.freeze({
    lifetimeMs: 6000,
    drift: Object.freeze({ dx: 0.02, dy: -0.005, variance: 0.05 }),
    color: Object.freeze({ r: 0.95, g: 0.92, b: 0.78, a: 0.2 }),
  }),
  smoke: Object.freeze({
    lifetimeMs: 3500,
    drift: Object.freeze({ dx: 0.0, dy: -0.06, variance: 0.04 }),
    color: Object.freeze({ r: 0.78, g: 0.72, b: 0.6, a: 0.32 }),
  }),
  spark: Object.freeze({
    lifetimeMs: 800,
    drift: Object.freeze({ dx: 0.0, dy: -0.12, variance: 0.18 }),
    color: Object.freeze({ r: 1.0, g: 0.78, b: 0.35, a: 0.95 }),
  }),
  firefly: Object.freeze({
    lifetimeMs: 5200,
    drift: Object.freeze({ dx: 0.0, dy: 0.01, variance: 0.08 }),
    color: Object.freeze({ r: 0.85, g: 1.0, b: 0.6, a: 0.85 }),
  }),
  ember: Object.freeze({
    lifetimeMs: 2400,
    drift: Object.freeze({ dx: 0.0, dy: -0.04, variance: 0.1 }),
    color: Object.freeze({ r: 1.0, g: 0.45, b: 0.18, a: 0.9 }),
  }),
});

// ───────── density / visibility ─────────

/**
 * 由 timeOfDay + weather 派 density / visibility。
 *
 * density：粒子数倍率 [0, 1.5]
 *  - noon + clear → 0.7（白天室内可见度好，粒子少）
 *  - night → 1.0（夜晚萤火更显眼）
 *  - rain → 0.9（细雨空气感）
 *  - storm → 1.2（暴风）
 *  - snow → 1.3
 *  - fog → 1.4（雾中粒子明显）
 *
 * visibility：渲染透明度倍率 [0, 1]
 *  - night → 0.6（多数粒子在夜里"看不太清"，但萤火例外）
 *  - rain / snow / fog → 0.85（环境降饱和）
 *  - noon → 1.0
 *  - storm → 0.7
 */
export function deriveAtmosphereState(
  timeOfDay: TimeOfDayBand,
  weather: WeatherBand,
): { density: number; visibility: number } {
  let density = 0.7;
  let visibility = 1.0;

  switch (timeOfDay) {
    case 'dawn':
      density = 0.85;
      visibility = 0.9;
      break;
    case 'morning':
      density = 0.7;
      visibility = 1.0;
      break;
    case 'noon':
      density = 0.6;
      visibility = 1.0;
      break;
    case 'evening':
      density = 0.85;
      visibility = 0.92;
      break;
    case 'dusk':
      density = 1.0;
      visibility = 0.78;
      break;
    case 'night':
      density = 1.05;
      visibility = 0.65;
      break;
  }

  switch (weather) {
    case 'rain':
      density = Math.max(density, 0.95);
      visibility = Math.min(visibility, 0.85);
      break;
    case 'storm':
      density = Math.max(density, 1.25);
      visibility = Math.min(visibility, 0.7);
      break;
    case 'snow':
      density = Math.max(density, 1.3);
      visibility = Math.min(visibility, 0.88);
      break;
    case 'fog':
      density = Math.max(density, 1.4);
      visibility = Math.min(visibility, 0.78);
      break;
    case 'clear':
    default:
      break;
  }

  return Object.freeze({
    density: Math.min(1.5, Math.max(0, density)),
    visibility: Math.min(1, Math.max(0.2, visibility)),
  });
}

/**
 * 由 publicState 解析 weather 衍生（用于 Atmosphere 复用）。
 * 暴露函数使得 Atmosphere 不直接依赖 lighting 子模块，但保持相同语义。
 */
export function readAtmospherePublicState(publicState: WorldEntityPublicState | null | undefined): {
  timeOfDay: TimeOfDayBand;
  weather: WeatherBand;
  density: number;
  visibility: number;
} {
  const tod = readTimeOfDay(publicState);
  const weather = readWeather(publicState);
  const { density, visibility } = deriveAtmosphereState(tod, weather);
  return { timeOfDay: tod, weather, density, visibility };
}

// ───────── determinism ─────────

/**
 * 简易确定性 PRNG（mulberry32）。单测要求"相同输入 → 相同粒子流"。
 */
export function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── pipeline ─────────

export type AtmosphereListener = (snapshot: Readonly<AtmosphereSnapshot>) => void;

export type AtmosphereOptions = {
  readonly initialSpec?: AtmosphereLayerSpec | null;
  /** PRNG 种子（默认 0xC0FFEE，便于复现）。 */
  readonly seed?: number;
  /** 上限粒子数（避免性能雪崩）。 */
  readonly maxParticles?: number;
};

const DEFAULT_MAX_PARTICLES = 256;

/**
 * Atmosphere Pipeline — 状态机 + 订阅 + tick。
 *
 * 状态机：
 *  - `setSpec(spec)`：替换 emitters（地图切换）
 *  - `applyPublicState(state)`：刷新 density / visibility
 *  - `tick(deltaMs, now)`：推进粒子 + 回收过期 + 按 density 限额补粒子
 *
 * 设计：
 *  - 内部维护 nextId 单调递增；同一种子下粒子流可复现。
 *  - 渲染层读 snapshot.particles；无需关心 pipeline 内部状态。
 */
export class Atmosphere {
  readonly #maxParticles: number;
  #spec: AtmosphereLayerSpec | null;
  #particles: AtmosphereParticle[];
  #nextId = 0;
  #density = 0.7;
  #visibility = 1.0;
  #timeOfDay: TimeOfDayBand = 'noon';
  #weather: WeatherBand = 'clear';
  #specVersion = 0;
  #snapshot: AtmosphereSnapshot;
  readonly #listeners: Set<AtmosphereListener> = new Set();
  readonly #prng: () => number;
  #destroyed = false;

  constructor(options: AtmosphereOptions = {}) {
    this.#maxParticles = options.maxParticles ?? DEFAULT_MAX_PARTICLES;
    this.#spec = options.initialSpec ?? null;
    this.#particles = [];
    this.#prng = makePrng(options.seed ?? 0xc0ffee);
    this.#snapshot = Object.freeze({
      mapId: this.#spec?.mapId ?? null,
      specVersion: 0,
      emitters: this.#spec?.emitters ?? [],
      particles: Object.freeze(this.#particles.slice()),
      density: this.#density,
      visibility: this.#visibility,
      timeOfDay: this.#timeOfDay,
      weather: this.#weather,
    });
  }

  snapshot(): Readonly<AtmosphereSnapshot> {
    return this.#snapshot;
  }

  /**
   * 替换大气层 spec（地图切换 / 加载完成）。
   * 幂等：emitter 列表与 mapId 均未变 → no-op；否则重建粒子池。
   */
  setSpec(spec: AtmosphereLayerSpec | null): void {
    if (this.#destroyed) return;
    if (
      this.#spec?.mapId === (spec?.mapId ?? null) &&
      this.#specVersion > 0 &&
      emittersEqual(this.#spec?.emitters ?? [], spec?.emitters ?? [])
    ) {
      return;
    }
    this.#spec = spec;
    this.#particles = [];
    this.#specVersion += 1;
    this.#seedParticles();
    this.#commit(this.#spec?.mapId ?? null, this.#spec?.emitters ?? []);
  }

  /** 应用一份 publicState；同步 density / visibility。 */
  applyPublicState(publicState: WorldEntityPublicState | null | undefined): void {
    if (this.#destroyed) return;
    const next = readAtmospherePublicState(publicState);
    if (
      next.timeOfDay === this.#timeOfDay &&
      next.weather === this.#weather &&
      next.density === this.#density &&
      next.visibility === this.#visibility
    ) {
      return;
    }
    this.#timeOfDay = next.timeOfDay;
    this.#weather = next.weather;
    this.#density = next.density;
    this.#visibility = next.visibility;
    this.#commit(this.#spec?.mapId ?? null, this.#spec?.emitters ?? []);
  }

  /**
   * 推进粒子：age += deltaMs；过期回收；按 density 限额补粒子。
   * 调用方按 `requestAnimationFrame` / runtime tick 节奏驱动。
   *
   * 性能：O(particles.length)；单测可注入大 deltaMs 验证大跨度行为。
   */
  tick(deltaMs: number, now: number): void {
    if (this.#destroyed) return;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    if (!this.#spec) return;
    const emitters = this.#spec.emitters;
    if (emitters.length === 0) {
      if (this.#particles.length > 0) {
        this.#particles = [];
        this.#commit(this.#spec.mapId, emitters);
      }
      return;
    }
    // 1) advance
    const surviving: AtmosphereParticle[] = [];
    for (const p of this.#particles) {
      const nextAge = p.age + deltaMs;
      if (nextAge >= p.lifetime) continue;
      const px = p.position.x + (p.velocity.dx * deltaMs) / 16;
      const py = p.position.y + (p.velocity.dy * deltaMs) / 16;
      const lifetimeRatio = nextAge / p.lifetime;
      const color = fadeColor(p.color, lifetimeRatio);
      surviving.push(
        Object.freeze({
          ...p,
          age: nextAge,
          position: { x: px, y: py },
          color,
        }),
      );
    }
    // 2) 按 density 补粒子
    const totalTarget = computeTargetCount(emitters, this.#density, this.#maxParticles);
    while (surviving.length < totalTarget && surviving.length < this.#maxParticles) {
      const seeded = this.#spawnOne(now);
      if (!seeded) break;
      surviving.push(seeded);
    }
    // 3) 同样情况下若没变化且与上次 snapshot 一致则不发 listener
    if (
      surviving.length === this.#particles.length &&
      surviving.every((p, i) => {
        const prev = this.#particles[i];
        return (
          !!prev &&
          prev.age === p.age &&
          prev.position.x === p.position.x &&
          prev.position.y === p.position.y
        );
      })
    ) {
      // 仍要更新内部 #particles（age 已变），但不触发 listener
      this.#particles = surviving;
      return;
    }
    this.#particles = surviving;
    this.#commit(this.#spec.mapId, emitters);
  }

  subscribe(listener: AtmosphereListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#listeners.clear();
    this.#particles = [];
    this.#spec = null;
  }

  // ───────── internals ─────────

  #seedParticles(): void {
    const spec = this.#spec;
    if (!spec) return;
    const emitters = spec.emitters;
    if (emitters.length === 0) return;
    const initialTarget = computeTargetCount(emitters, this.#density, this.#maxParticles);
    const seeded: AtmosphereParticle[] = [];
    for (let i = 0; i < initialTarget && i < this.#maxParticles; i++) {
      const p = this.#spawnOne(0);
      if (!p) break;
      seeded.push(p);
    }
    this.#particles = seeded;
  }

  #spawnOne(now: number): AtmosphereParticle | null {
    const spec = this.#spec;
    if (!spec) return null;
    const emitters = spec.emitters;
    if (emitters.length === 0) return null;
    // 用 now 给发射源选择加微扰，避免同一帧连续 spawn 锁在同一 emitter 上
    const tickPhase = ((now & 0xff) / 256) * emitters.length;
    const baseIdx = Math.floor(this.#prng() * emitters.length);
    const idx = (baseIdx + Math.floor(tickPhase)) % emitters.length;
    const emitter = emitters[idx];
    if (!emitter) return null;
    const tuning = DEFAULT_KIND_TUNING[emitter.kind];
    const lifetime = emitter.lifetimeMs ?? tuning.lifetimeMs;
    // 起点：anchor 优先；否则在 area 内均匀
    let baseX: number;
    let baseY: number;
    if (emitter.anchor) {
      baseX = emitter.anchor.x;
      baseY = emitter.anchor.y;
    } else {
      baseX = emitter.area.x + this.#prng() * emitter.area.w;
      baseY = emitter.area.y + this.#prng() * emitter.area.h;
    }
    // 漂移：基础 + jitter
    const drift = emitter.drift ?? tuning.drift;
    const vdx = drift.dx + (this.#prng() - 0.5) * 2 * drift.variance;
    const vdy = drift.dy + (this.#prng() - 0.5) * 2 * drift.variance;
    // 寿命比例起点：随机（用 now 微扰，确保不是同一时刻全部同步）
    const age = (this.#prng() * lifetime) | 0;
    const color = fadeColor(emitter.color, age / lifetime);
    this.#nextId += 1;
    return Object.freeze({
      id: this.#nextId,
      emitterIndex: idx,
      kind: emitter.kind,
      position: Object.freeze({ x: baseX, y: baseY }),
      velocity: Object.freeze({ dx: vdx, dy: vdy }),
      age,
      lifetime,
      color,
    });
  }

  #commit(mapId: string | null, emitters: readonly AtmosphereSpec[]): void {
    this.#snapshot = Object.freeze({
      mapId,
      specVersion: this.#specVersion,
      emitters,
      particles: Object.freeze(this.#particles.slice()),
      density: this.#density,
      visibility: this.#visibility,
      timeOfDay: this.#timeOfDay,
      weather: this.#weather,
    });
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch {
        // 吞 listener 错误
      }
    }
  }
}

/** 工厂。 */
export function createAtmosphere(options?: AtmosphereOptions): Atmosphere {
  return new Atmosphere(options);
}

// ───────── pure helpers ─────────

/**
 * 由 emitters + density 派"目标粒子数"，上限为 maxParticles。
 */
export function computeTargetCount(
  emitters: readonly AtmosphereSpec[],
  density: number,
  maxParticles: number,
): number {
  if (emitters.length === 0 || density <= 0 || maxParticles <= 0) return 0;
  let raw = 0;
  for (const e of emitters) raw += e.count;
  const scaled = Math.round(raw * density);
  if (scaled < 0) return 0;
  return Math.min(scaled, maxParticles);
}

/**
 * 颜色随生命周期淡入淡出：
 *  - ratio 0..1
 *  - 0..0.15 fade-in（a *= ratio/0.15）
 *  - 0.15..0.75 满色
 *  - 0.75..1 fade-out（a *= 1 - (ratio - 0.75)/0.25）
 */
export function fadeColor(color: AtmosphereColor, ratio: number): AtmosphereColor {
  const r = clamp01(ratio);
  let a = color.a;
  if (r < 0.15) a *= r / 0.15;
  else if (r > 0.75) a *= 1 - (r - 0.75) / 0.25;
  return Object.freeze({ r: color.r, g: color.g, b: color.b, a });
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function emittersEqual(a: readonly AtmosphereSpec[], b: readonly AtmosphereSpec[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.kind !== y.kind) return false;
    if (x.count !== y.count) return false;
    if (x.area.x !== y.area.x || x.area.y !== y.area.y) return false;
    if (x.area.w !== y.area.w || x.area.h !== y.area.h) return false;
    if (x.color.r !== y.color.r || x.color.g !== y.color.g) return false;
    if (x.color.b !== y.color.b || x.color.a !== y.color.a) return false;
  }
  return true;
}
