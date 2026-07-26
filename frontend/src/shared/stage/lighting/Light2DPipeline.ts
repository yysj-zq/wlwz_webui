/**
 * Light2D Pipeline（Phase 2 VS4 Spec §HD-2D 光照）。
 *
 * 设计目标：
 *  - **法线贴图接管光源**：CPU 端合并所有点光源（灯笼/窗户）写入 lightMap，
 *    fragment 端只做"ambient + normalMap × sky + lightMap"三段合成。
 *  - **公开状态驱动**：昼夜/天气键写在 `world_state.public_state` 上（spec §A
 *    与 §6 明确"public_state 驱动"）；pipeline 解析后调整 ambient 与 flicker。
 *  - **缺法线**：`normalStrength=0`，WebGL filter 仍挂载（非换渲染后端）。
 *  - **WebGL 诊断**：`probeWebGL` 写入 snapshot；真正渲染由 StageSystems
 *    注册 Phaser 4 Filters，失败则门闸——禁止 CSS / 背景色假光照。
 *  - **不依赖 Phaser**：纯数据 + 状态机，便于单测；WebGL Filter 在
 *    `Light2DFilter.ts` / StageSystems。
 *  - **shader 源在 `./shaders`**：fragment 适配 Phaser 4 `BaseFilterShader`
 *   （`uMainSampler` / `outTexCoord`）。
 *
 * 与 StageRuntime 契约的关系：
 *  - 不修改 StageRuntime 接口；调用方在 `patch-applied` 事件里取
 *    `lastAppliedPatch` 的 entity，把指定 actor（默认 `world` / `scene` /
 *    任意持有 publicState 的实体）的 `publicState` 喂给
 *    `applyPublicState(publicState)`。
 *  - 真正绑 runtime 是 GameShell 的工作；本模块只暴露纯 API。
 */
import type { WorldEntityPublicState } from '@shared/api';
import {
  LIGHT2D_FRAGMENT_SOURCE,
  LIGHT2D_VERTEX_SOURCE,
  assertLight2DFragmentShape,
  assertLight2DVertexShape,
} from './shaders';

// ───────── types ─────────

/** 颜色：分量在 [0, 1]；与 WebGL 颜色空间对齐。 */
export type RGB = { readonly r: number; readonly g: number; readonly b: number };

/** 光颜色：在 RGB 之上加 intensity（与色温独立的"强度"，方便混合）。 */
export type LightColor = RGB & { readonly intensity: number };

/** 单个光源类型。 */
export type LightKind = 'lantern' | 'window' | 'ambient' | 'point';

/**
 * 单个光源定义。
 *
 *  - `position`：tile 坐标（与 WorldEntity.position 一致）。
 *  - `radius`：逻辑像素（设计分辨率下），用于 CPU 端写 lightMap。
 *  - `color`：基色（暖 / 冷 / 自定义），intensity 为 [0, 4] 的乘法因子。
 *  - `flicker`：可选；用于灯笼摇曳（火苗 / 气流）。CPU 端按 periodMs
 *    计算正弦偏移，喂给 fragment 的 `u_lightScale`。
 */
export type LightDef = {
  readonly id: string;
  readonly kind: LightKind;
  readonly position: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly color: LightColor;
  readonly flicker?: { readonly periodMs: number; readonly amplitude: number };
};

/**
 * 灯光标注层（来自 Tiled lighting.json 或 manifest 等价物）。
 *
 * 约定（§A.2）：每张地图一个 lighting.json，至少：
 *   - 3 盏 lantern（暖光 #FFB060，radius=120px）
 *   - 2 扇 window（冷光 #A0C0FF，radius=180px）
 *
 * 这里我们只暴露解析后形态；加载器侧（VS1 AssetLoader）负责把 URL
 * 转成 LightingLayerSpec 后再喂给 pipeline。
 */
export type LightingLayerSpec = {
  readonly ambient: LightColor;
  readonly lights: readonly LightDef[];
};

/** 昼夜时段：6 段划分（与 §6/§A.2 暗示吻合）。 */
export type TimeOfDayBand = 'dawn' | 'morning' | 'noon' | 'evening' | 'dusk' | 'night';

/** 天气：影响 ambient 浓度与粒子密度（VS6 Atmosphere 共享同一 key）。 */
export type WeatherBand = 'clear' | 'rain' | 'snow' | 'fog' | 'storm';

/** 调色板：token 驱动，与 design-system/styles/tokens.css 品牌色锚定。 */
export type LightingPalette = {
  readonly lanternWarm: LightColor;
  readonly windowCool: LightColor;
  readonly dayAmbient: LightColor;
  readonly nightAmbient: LightColor;
  readonly fogAmbient: LightColor;
};

/**
 * Pipeline 公开快照 — 渲染层（PhaserRuntime）订阅后用于：
 *  - 写 lightMap 纹理（CPU 端按 `lights` + 当前 `palette` + `flickerOffsets` 写）
 *  - 设置 fragment uniform：`u_ambientColor`, `u_ambientIntensity`,
 *    `u_lightScale`, `u_normalStrength`
 */
export type LightingSnapshot = {
  readonly mapId: string | null;
  readonly specVersion: number;
  readonly lights: readonly LightDef[];
  readonly ambient: LightColor;
  readonly palette: LightingPalette;
  readonly timeOfDay: TimeOfDayBand;
  readonly weather: WeatherBand;
  /**
   * 每个光源的当前 flicker 偏移（[-1, 1]）。数组下标与 `lights` 一一对应。
   * pipeline 在 `tick(now)` 时刷新；snapshotter 也可在同步渲染路径上读。
   */
  readonly flickerOffsets: readonly number[];
  readonly webglAvailable: boolean;
  readonly webglReason: WebGLProbeReason | null;
};

// ───────── WebGL probe ─────────

export type WebGLProbeReason = 'NO_CONTEXT' | 'CONTEXT_LOST' | 'DISABLED' | 'NO_DOCUMENT';

export type WebGLProbeResult = {
  readonly available: boolean;
  readonly reason: WebGLProbeReason | null;
  readonly vendor: string | null;
  readonly version: string | null;
};

/**
 * 探针：在 DOM 里尝试拿 WebGL1 上下文；拿不到 → 优雅降级。
 *
 * 设计：
 *  - jsdom / node 环境返回 `available=false, reason='NO_DOCUMENT'`；
 *  - 拿到 context 但 `isContextLost()` → `'CONTEXT_LOST'`；
 *  - 显式禁用（一些公司策略 / 浏览器省电） → `'DISABLED'`；
 *  - 真正可用 → `available=true`，并保留 vendor / version 便于调试。
 */
export function probeWebGL(doc?: Document | null): WebGLProbeResult {
  if (typeof document === 'undefined' && !doc) {
    return { available: false, reason: 'NO_DOCUMENT', vendor: null, version: null };
  }
  const d = doc ?? document;
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = d.createElement('canvas');
  } catch {
    return { available: false, reason: 'NO_CONTEXT', vendor: null, version: null };
  }
  if (!canvas) {
    return { available: false, reason: 'NO_CONTEXT', vendor: null, version: null };
  }
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl');
    if (!gl) {
      gl = canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    }
  } catch {
    gl = null;
  }
  if (!gl) {
    return { available: false, reason: 'NO_CONTEXT', vendor: null, version: null };
  }
  if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
    return { available: false, reason: 'CONTEXT_LOST', vendor: null, version: null };
  }
  // vendor / version 在不同浏览器 / WebGL2 表现差异较大；只取可读字段
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  let vendor: string | null = null;
  let version: string | null = null;
  if (dbg) {
    const v = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as unknown;
    const ver = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as unknown;
    if (typeof v === 'string') vendor = v;
    if (typeof ver === 'string') version = ver;
  } else {
    const v = gl.getParameter(gl.VENDOR) as unknown;
    const ver = gl.getParameter(gl.VERSION) as unknown;
    if (typeof v === 'string') vendor = v;
    if (typeof ver === 'string') version = ver;
  }
  return { available: true, reason: null, vendor, version };
}

// ───────── publicState 解读 ─────────

const TIME_OF_DAY_KEYS: ReadonlySet<TimeOfDayBand> = new Set<TimeOfDayBand>([
  'dawn',
  'morning',
  'noon',
  'evening',
  'dusk',
  'night',
]);

const WEATHER_KEYS: ReadonlySet<WeatherBand> = new Set<WeatherBand>([
  'clear',
  'rain',
  'snow',
  'fog',
  'storm',
]);

/**
 * 从 `publicState` 解读 timeOfDay。
 *  - `timeOfDay` 字符串命中 6 段之一 → 直接返回
 *  - `timeOfDay` 数字（[0, 1] 一天进度）→ 离散化到 6 段
 *  - 否则兜底 'noon'
 */
export function readTimeOfDay(
  publicState: WorldEntityPublicState | null | undefined,
): TimeOfDayBand {
  if (!publicState || typeof publicState !== 'object') return 'noon';
  const raw = (publicState as { readonly timeOfDay?: unknown }).timeOfDay;
  if (typeof raw === 'string' && TIME_OF_DAY_KEYS.has(raw as TimeOfDayBand)) {
    return raw as TimeOfDayBand;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const v = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    if (v < 0.16) return 'dawn';
    if (v < 0.4) return 'morning';
    if (v < 0.62) return 'noon';
    if (v < 0.78) return 'evening';
    if (v < 0.9) return 'dusk';
    return 'night';
  }
  return 'noon';
}

/**
 * 从 `publicState` 解读 weather。
 *  - 字符串命中 5 段之一 → 返回
 *  - 否则兜底 'clear'
 */
export function readWeather(publicState: WorldEntityPublicState | null | undefined): WeatherBand {
  if (!publicState || typeof publicState !== 'object') return 'clear';
  const raw = (publicState as { readonly weather?: unknown }).weather;
  if (typeof raw === 'string' && WEATHER_KEYS.has(raw as WeatherBand)) {
    return raw as WeatherBand;
  }
  return 'clear';
}

// ───────── palette ─────────

/**
 * 默认调色板（Phase 2 同福客栈基线）：
 *  - 灯笼暖光：`#FFB060`（brand-lantern）
 *  - 窗户冷光：`#A0C0FF`（窗外天光）
 *  - 白天 ambient：宣纸 + 灰（day-warm）
 *  - 夜晚 ambient：墨 + 蓝紫（night-cool）
 *  - 雾天 ambient：灰白（fog-grey）
 *
 * 与 design-system/styles/tokens.css 的品牌色对齐；token 一旦调整，
 * 本常量应在 Style Dictionary 构建时同步覆盖。
 */
export const DEFAULT_LIGHTING_PALETTE: LightingPalette = Object.freeze({
  lanternWarm: Object.freeze({ r: 1.0, g: 176 / 255, b: 96 / 255, intensity: 1.0 }),
  windowCool: Object.freeze({ r: 160 / 255, g: 192 / 255, b: 1.0, intensity: 0.7 }),
  dayAmbient: Object.freeze({ r: 0.85, g: 0.82, b: 0.72, intensity: 0.6 }),
  nightAmbient: Object.freeze({ r: 0.1, g: 0.08, b: 0.18, intensity: 0.18 }),
  fogAmbient: Object.freeze({ r: 0.72, g: 0.72, b: 0.74, intensity: 0.45 }),
});

/**
 * 由 timeOfDay + weather 派生 ambient 颜色。
 *
 * 设计：
 *  - 时段挑"昼夜基底"：dawn/morning/noon/evening/dusk → day；night → night
 *  - 雾天压一档 intensity（画面灰白）
 *  - 雨 / 雪压一档 intensity（环境冷 + 暗）
 *  - 风暴再压一档（极端天气）
 *  - 结果仍用 Object.freeze 包裹，下游不允许原地改
 */
export function deriveAmbient(
  band: TimeOfDayBand,
  weather: WeatherBand,
  palette: LightingPalette = DEFAULT_LIGHTING_PALETTE,
): LightColor {
  const base: LightColor = band === 'night' ? palette.nightAmbient : palette.dayAmbient;
  let intensity = base.intensity;
  let color: RGB = { r: base.r, g: base.g, b: base.b };

  switch (weather) {
    case 'fog':
      intensity *= 0.8;
      color = {
        r: palette.fogAmbient.r,
        g: palette.fogAmbient.g,
        b: palette.fogAmbient.b,
      };
      break;
    case 'rain':
      intensity *= 0.7;
      break;
    case 'snow':
      intensity *= 0.85;
      break;
    case 'storm':
      intensity *= 0.55;
      break;
    case 'clear':
    default:
      break;
  }

  // dusk / dawn 额外降一档（环境色更暗）
  if (band === 'dusk' || band === 'dawn') {
    intensity *= 0.78;
  }

  return Object.freeze({ r: color.r, g: color.g, b: color.b, intensity });
}

// ───────── flicker ─────────

/**
 * 计算单个光源在当前时刻的 flicker 偏移（[-1, 1]）。
 *
 * 用 sin：periodMs 决定周期，amplitude 决定范围；无 flicker 配置 → 0。
 */
export function computeFlickerOffset(def: LightDef, now: number, seedOffset: number = 0): number {
  const f = def.flicker;
  if (!f || f.amplitude <= 0 || f.periodMs <= 0) return 0;
  const phase = ((now + seedOffset) % f.periodMs) / f.periodMs;
  return Math.sin(phase * Math.PI * 2) * f.amplitude;
}

// ───────── Pipeline ─────────

export type LightingListener = (snapshot: Readonly<LightingSnapshot>) => void;

export type Light2DPipelineOptions = {
  readonly palette?: LightingPalette;
  readonly initialSpec?: LightingLayerSpec | null;
  readonly webgl?: WebGLProbeResult | null;
};

/**
 * Light2D Pipeline — 不可变快照 + 订阅模式。
 *
 * 状态机：
 *   - `setLightingSpec(spec)`：替换光源清单（地图切换）
 *   - `applyPublicState(state)`：从公共状态推 timeOfDay / weather
 *   - `tick(now)`：刷新 flicker 偏移（每帧）
 *
 * 不依赖任何外部时钟；调用方按 `requestAnimationFrame` / runtime tick 驱动。
 */
export class Light2DPipeline {
  readonly #palette: LightingPalette;
  readonly #webgl: WebGLProbeResult;
  #snapshot: LightingSnapshot;
  readonly #listeners: Set<LightingListener> = new Set();
  #destroyed = false;
  #specVersion = 0;
  #now = 0;

  constructor(options: Light2DPipelineOptions = {}) {
    this.#palette = options.palette ?? DEFAULT_LIGHTING_PALETTE;
    this.#webgl = options.webgl ?? probeWebGL();
    const initialSpec = options.initialSpec ?? null;
    const lights = initialSpec?.lights ?? [];
    const ambient = initialSpec?.ambient ?? DEFAULT_LIGHTING_PALETTE.dayAmbient;
    this.#snapshot = Object.freeze({
      mapId: null,
      specVersion: 0,
      lights,
      ambient,
      palette: this.#palette,
      timeOfDay: 'noon',
      weather: 'clear',
      flickerOffsets: Object.freeze(new Array<number>(lights.length).fill(0)),
      webglAvailable: this.#webgl.available,
      webglReason: this.#webgl.reason,
    });
  }

  /** 当前快照。 */
  snapshot(): Readonly<LightingSnapshot> {
    return this.#snapshot;
  }

  /** WebGL 是否可用；为 false 时渲染层跳过法线混合路径。 */
  isSupported(): boolean {
    return this.#webgl.available;
  }

  /** WebGL probe 结果（vendor / version 便于调试）。 */
  webgl(): Readonly<WebGLProbeResult> {
    return this.#webgl;
  }

  /**
   * 替换灯光标注层（地图切换或 lighting.json 加载完成时调）。
   * 幂等：相同 spec 不触发 listener。
   */
  setLightingSpec(spec: LightingLayerSpec | null, mapId: string | null = null): void {
    if (this.#destroyed) return;
    const lights = spec?.lights ?? [];
    const ambient = spec?.ambient ?? this.#palette.dayAmbient;
    const next: LightingSnapshot = Object.freeze({
      ...this.#snapshot,
      mapId,
      specVersion: this.#specVersion + 1,
      lights,
      ambient,
      flickerOffsets: Object.freeze(new Array<number>(lights.length).fill(0)),
    });
    this.#specVersion = next.specVersion;
    this.#commit(next);
  }

  /**
   * 应用一份 publicState（来自 world_state.public_state 或特定 actor）。
   * 解析 timeOfDay + weather 后派生 ambient，并刷新 ambient channel。
   */
  applyPublicState(publicState: WorldEntityPublicState | null | undefined): void {
    if (this.#destroyed) return;
    const tod = readTimeOfDay(publicState);
    const weather = readWeather(publicState);
    const ambient = deriveAmbient(tod, weather, this.#palette);
    if (
      tod === this.#snapshot.timeOfDay &&
      weather === this.#snapshot.weather &&
      ambient.r === this.#snapshot.ambient.r &&
      ambient.g === this.#snapshot.ambient.g &&
      ambient.b === this.#snapshot.ambient.b &&
      ambient.intensity === this.#snapshot.ambient.intensity
    ) {
      return;
    }
    const next: LightingSnapshot = Object.freeze({
      ...this.#snapshot,
      timeOfDay: tod,
      weather,
      ambient,
    });
    this.#commit(next);
  }

  /**
   * 每帧调用：用 `now` 刷新所有光源的 flicker 偏移。
   * 同一 now 内幂等（避免每帧 N 个 listener）。
   */
  tick(now: number): void {
    if (this.#destroyed) return;
    if (now === this.#now) return;
    this.#now = now;
    const lights = this.#snapshot.lights;
    if (lights.length === 0) return;
    const offsets: number[] = new Array<number>(lights.length);
    let changed = false;
    for (let i = 0; i < lights.length; i++) {
      const def = lights[i];
      if (!def) {
        offsets[i] = 0;
        continue;
      }
      const off = computeFlickerOffset(def, now, i * 137);
      offsets[i] = off;
      if (off !== this.#snapshot.flickerOffsets[i]) changed = true;
    }
    if (!changed) return;
    const next: LightingSnapshot = Object.freeze({
      ...this.#snapshot,
      flickerOffsets: Object.freeze(offsets),
    });
    this.#commit(next);
  }

  /** 订阅；返回反订阅函数。 */
  subscribe(listener: LightingListener): () => void {
    this.#listeners.add(listener);
    // 立即喂一次现状，方便消费方初始化
    listener(this.#snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 销毁：清空 listeners，禁止后续调用。 */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#listeners.clear();
  }

  #commit(next: LightingSnapshot): void {
    this.#snapshot = next;
    for (const listener of this.#listeners) {
      try {
        listener(next);
      } catch {
        // listener 错误被吞，避免阻塞后续 listener
      }
    }
  }
}

/** 工厂。 */
export function createLight2DPipeline(options?: Light2DPipelineOptions): Light2DPipeline {
  return new Light2DPipeline(options);
}

/**
 * 在启动时校验 shader 源完整性。
 * WebGL 不可用时仍可调（仅做 shape 校验，不调 glCompileShader）。
 *
 * 设计理由：把 shader 编译失败的可能性提前到模块加载期发现，避免
 * runtime 在 setLightingSpec 时第一次失败。
 */
export function validateLight2DShaders(): {
  vertex: true;
  fragment: true;
} {
  assertLight2DVertexShape(LIGHT2D_VERTEX_SOURCE);
  assertLight2DFragmentShape(LIGHT2D_FRAGMENT_SOURCE);
  return { vertex: true, fragment: true };
}

// ───────── integration helpers ─────────

/**
 * 从 StageRuntime 快照里抽取"环境 publicState"。
 *
 * 约定（按 §6 与 §A 推断）：
 *  - WorldState 本身将来可能有顶层 publicState（暂未在 OpenAPI 出现）；
 *  - 现行做法：从"world"/"scene"等保留 actor 的 publicState 读取；
 *  - 找不到 → 返回 null，pipeline 走兜底（noon / clear）。
 */
export function readWorldEnvironmentFromSnapshot(
  worldState: { readonly publicState?: WorldEntityPublicState | null } & Record<string, unknown>,
): WorldEntityPublicState | null {
  const top = (worldState as { readonly publicState?: WorldEntityPublicState | null }).publicState;
  if (top && typeof top === 'object') return top;
  // 兜底：从 entities 找候选 actor
  const entities = (
    worldState as {
      readonly entities?: Record<string, { readonly publicState?: WorldEntityPublicState }>;
    }
  ).entities;
  if (!entities || typeof entities !== 'object') return null;
  for (const id of ['world', 'scene', 'environment']) {
    const ent = entities[id];
    if (ent && ent.publicState && typeof ent.publicState === 'object') {
      return ent.publicState;
    }
  }
  return null;
}
