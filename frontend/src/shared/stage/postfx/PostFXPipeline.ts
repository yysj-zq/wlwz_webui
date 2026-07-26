/**
 * PostFX Pipeline（Phase 2 VS5 Spec §Bloom + Vignette + Color Grading）。
 *
 * 设计目标：
 *  - **统一抽象**：bloom / vignette / colorGrading 三件套作为一个 pipeline，
 *    不再各自散落 uniform；GameShell 只订阅一个 snapshot。
 *  - **publicState 驱动**：timeOfDay / weather 决定默认 preset（白天 / 夜
 *    / 雾 / 雪）。preset 由纯函数生成，可在单测里覆盖。
 *  - **唯一 WebGL 路径**：snapshot 由 StageSystems 驱动 Phaser 4 内置
 *    Filters（Bloom / Vignette / ColorMatrix）；禁止 canvas CSS filter。
 *  - **probe**：`webglAvailable` 仅作诊断；渲染失败由 runtime 门闸。
 *  - **依赖 Shader**：自定义 grading GLSL 仍在 `./shaders`（备用）；
 *    主路径优先内置 Filters。
 *  - **不破坏 StageRuntime 契约**：pipeline 接受外部 `tick` /
 *    `applyPublicState`，不订阅 runtime 事件（订阅是 GameShell 责任）。
 */
import type { WorldEntityPublicState } from '@shared/api';

import {
  POSTFX_FRAGMENT_SOURCE,
  POSTFX_VERTEX_SOURCE,
  assertPostFXFragmentShape,
  assertPostFXVertexShape,
} from './shaders';
import { probeWebGL, type WebGLProbeResult } from '@shared/stage/lighting';
import type { TimeOfDayBand, WeatherBand } from '@shared/stage/lighting';
import { readTimeOfDay, readWeather } from '@shared/stage/lighting';

// ───────── types ─────────

export type BloomConfig = {
  /** 高于此亮度的像素会贡献 bloom；范围 [0, 1]。 */
  readonly threshold: number;
  /** bloom 强度；范围 [0, 1.5]。 */
  readonly intensity: number;
  /** bloom 半径（像素）；范围 [1, 64]。 */
  readonly radius: number;
};

export type VignetteConfig = {
  /** 暗角起始半径（uv 单位）；范围 [0, 1.4]。 */
  readonly start: number;
  /** 暗角结束半径；范围 [start, 1.6]。 */
  readonly end: number;
  /** 暗角强度；范围 [0, 1]。 */
  readonly intensity: number;
};

export type ColorGradingConfig = {
  /** 暖度 [-1, 1]：>0 偏暖，<0 偏冷。 */
  readonly warmth: number;
  /** 饱和度 [-1, 1]：>0 增强，<0 降低。 */
  readonly saturation: number;
  /** 对比度 [-1, 1]。 */
  readonly contrast: number;
};

export type PostFXConfig = {
  readonly bloom: BloomConfig;
  readonly vignette: VignetteConfig;
  readonly colorGrading: ColorGradingConfig;
  /** 是否启用整体后处理；false 时只保留 ambient 色（snapshot 仍在更新）。 */
  readonly enabled: boolean;
};

/**
 * 公开快照：渲染层（Phaser 4 PostFX pipeline）按它写 uniform。
 */
export type PostFXSnapshot = {
  readonly config: PostFXConfig;
  readonly timeOfDay: TimeOfDayBand;
  readonly weather: WeatherBand;
  readonly webglAvailable: boolean;
  readonly webglReason: string | null;
};

// ───────── defaults ─────────

/** bloom 默认：阈值 0.62、强度 0.55、半径 6px（同福客栈基底）。 */
export const DEFAULT_BLOOM: BloomConfig = Object.freeze({
  threshold: 0.62,
  intensity: 0.55,
  radius: 6,
});

/** vignette 默认：start 0.55、end 1.05、强度 0.45（HD-2D 标准暗角）。 */
export const DEFAULT_VIGNETTE: VignetteConfig = Object.freeze({
  start: 0.55,
  end: 1.05,
  intensity: 0.45,
});

/** colorGrading 默认：warmth 0、saturation 0、contrast 0。 */
export const DEFAULT_COLOR_GRADING: ColorGradingConfig = Object.freeze({
  warmth: 0.0,
  saturation: 0.0,
  contrast: 0.0,
});

/** 整体默认（enabled=true）。 */
export const DEFAULT_POSTFX_CONFIG: PostFXConfig = Object.freeze({
  bloom: DEFAULT_BLOOM,
  vignette: DEFAULT_VIGNETTE,
  colorGrading: DEFAULT_COLOR_GRADING,
  enabled: true,
});

// ───────── preset ─────────

/**
 * 由 timeOfDay + weather 派生 preset（覆盖默认）。
 *
 * 决策表（§6 + §A.2）：
 *  - night  → bloom intensity 0.85（灯笼更亮）、warmth 0.25（暖）
 *  - dusk / dawn → 暖度中等、contrast 微调
 *  - noon    → 暖度 -0.05（偏凉）、contrast 0.05
 *  - rain / storm → saturation -0.15、contrast +0.1（风雨戏剧感）
 *  - snow    → saturation -0.25（去饱和白雪）、brightness 走 contrast
 *  - fog     → contrast -0.15（雾化）、saturation -0.3
 */
export function derivePostFXPreset(timeOfDay: TimeOfDayBand, weather: WeatherBand): PostFXConfig {
  // 用 readonly-friendly 的 immutable build：每一步都构造新对象。
  let bloom: BloomConfig = { ...DEFAULT_BLOOM };
  let vignette: VignetteConfig = { ...DEFAULT_VIGNETTE };
  let colorGrading: ColorGradingConfig = { ...DEFAULT_COLOR_GRADING };

  switch (timeOfDay) {
    case 'night':
      bloom = { ...bloom, intensity: 0.85, threshold: 0.5 };
      colorGrading = { ...colorGrading, warmth: 0.25 };
      vignette = { ...vignette, intensity: 0.6, start: 0.4, end: 0.95 };
      break;
    case 'dusk':
      bloom = { ...bloom, intensity: 0.7 };
      colorGrading = { ...colorGrading, warmth: 0.18 };
      vignette = { ...vignette, intensity: 0.5 };
      break;
    case 'dawn':
      bloom = { ...bloom, intensity: 0.65 };
      colorGrading = { ...colorGrading, warmth: 0.1 };
      vignette = { ...vignette, intensity: 0.45 };
      break;
    case 'morning':
      bloom = { ...bloom, intensity: 0.5 };
      colorGrading = { ...colorGrading, warmth: 0.05 };
      break;
    case 'noon':
      bloom = { ...bloom, intensity: 0.4 };
      colorGrading = { ...colorGrading, warmth: -0.05, contrast: 0.05 };
      break;
    case 'evening':
      bloom = { ...bloom, intensity: 0.6 };
      colorGrading = { ...colorGrading, warmth: 0.12 };
      vignette = { ...vignette, intensity: 0.5 };
      break;
  }

  switch (weather) {
    case 'rain':
      colorGrading = { ...colorGrading, saturation: -0.15, contrast: 0.1 };
      vignette = { ...vignette, intensity: Math.max(vignette.intensity, 0.55) };
      break;
    case 'storm':
      colorGrading = { ...colorGrading, saturation: -0.25, contrast: 0.18 };
      vignette = {
        ...vignette,
        intensity: Math.max(vignette.intensity, 0.65),
        start: Math.min(vignette.start, 0.45),
      };
      break;
    case 'snow':
      colorGrading = { ...colorGrading, saturation: -0.25, contrast: 0.08 };
      break;
    case 'fog':
      colorGrading = { ...colorGrading, saturation: -0.3, contrast: -0.15 };
      vignette = {
        ...vignette,
        intensity: Math.max(vignette.intensity, 0.5),
        start: Math.min(vignette.start, 0.5),
      };
      break;
    case 'clear':
    default:
      break;
  }

  return Object.freeze({
    bloom: Object.freeze(bloom),
    vignette: Object.freeze(vignette),
    colorGrading: Object.freeze(colorGrading),
    enabled: true,
  });
}

/**
 * 合并 partial config 与当前 config：浅合并到 bloom / vignette / colorGrading。
 * 用 partial 更新粒度小，调用方不需要重写整个三件套。
 */
export function mergePostFXConfig(
  base: PostFXConfig,
  partial: Partial<{
    bloom: Partial<BloomConfig>;
    vignette: Partial<VignetteConfig>;
    colorGrading: Partial<ColorGradingConfig>;
    enabled: boolean;
  }>,
): PostFXConfig {
  return Object.freeze({
    bloom: Object.freeze({ ...base.bloom, ...(partial.bloom ?? {}) }),
    vignette: Object.freeze({ ...base.vignette, ...(partial.vignette ?? {}) }),
    colorGrading: Object.freeze({
      ...base.colorGrading,
      ...(partial.colorGrading ?? {}),
    }),
    enabled: partial.enabled ?? base.enabled,
  });
}

// ───────── Pipeline ─────────

export type PostFXListener = (snapshot: Readonly<PostFXSnapshot>) => void;

export type PostFXPipelineOptions = {
  readonly initial?: PostFXConfig | null;
  readonly webgl?: WebGLProbeResult | null;
};

/**
 * PostFX Pipeline — 状态机 + 订阅模式。
 *
 * 状态机：
 *  - `setConfig(partial)`：手动覆盖（设计师 / 调试面板）
 *  - `applyPublicState(state)`：从公共状态派 preset
 *  - `reset()`：回到默认
 */
export class PostFXPipeline {
  #config: PostFXConfig;
  #timeOfDay: TimeOfDayBand = 'noon';
  #weather: WeatherBand = 'clear';
  readonly #webgl: WebGLProbeResult;
  #snapshot: PostFXSnapshot;
  readonly #listeners: Set<PostFXListener> = new Set();
  #destroyed = false;

  constructor(options: PostFXPipelineOptions = {}) {
    this.#config = options.initial ?? derivePostFXPreset('noon', 'clear');
    this.#webgl = options.webgl ?? probeWebGL();
    this.#snapshot = Object.freeze({
      config: this.#config,
      timeOfDay: this.#timeOfDay,
      weather: this.#weather,
      webglAvailable: this.#webgl.available,
      webglReason: this.#webgl.reason,
    });
  }

  snapshot(): Readonly<PostFXSnapshot> {
    return this.#snapshot;
  }

  isSupported(): boolean {
    return this.#webgl.available;
  }

  webgl(): Readonly<WebGLProbeResult> {
    return this.#webgl;
  }

  /** 当前 config（深读）。 */
  config(): Readonly<PostFXConfig> {
    return this.#config;
  }

  /**
   * 局部覆盖 config。语义浅合并到 bloom / vignette / colorGrading。
   */
  setConfig(
    partial: Partial<{
      bloom: Partial<BloomConfig>;
      vignette: Partial<VignetteConfig>;
      colorGrading: Partial<ColorGradingConfig>;
      enabled: boolean;
    }>,
  ): void {
    if (this.#destroyed) return;
    const next = mergePostFXConfig(this.#config, partial);
    if (configsEqual(next, this.#config)) return;
    this.#commit(next, this.#timeOfDay, this.#weather);
  }

  /** 回到默认 preset（基于当前 timeOfDay / weather）。 */
  reset(): void {
    if (this.#destroyed) return;
    const preset = derivePostFXPreset(this.#timeOfDay, this.#weather);
    if (configsEqual(preset, this.#config)) return;
    this.#commit(preset, this.#timeOfDay, this.#weather);
  }

  /**
   * 应用一份 publicState（VS5 与 VS4 共用 timeOfDay / weather 解读）。
   * preset 派生是纯函数；同一状态输入幂等。
   */
  applyPublicState(publicState: WorldEntityPublicState | null | undefined): void {
    if (this.#destroyed) return;
    const tod = readTimeOfDay(publicState);
    const weather = readWeather(publicState);
    if (tod === this.#timeOfDay && weather === this.#weather) return;
    const preset = derivePostFXPreset(tod, weather);
    this.#commit(preset, tod, weather);
  }

  subscribe(listener: PostFXListener): () => void {
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
  }

  #commit(config: PostFXConfig, tod: TimeOfDayBand, weather: WeatherBand): void {
    this.#config = config;
    this.#timeOfDay = tod;
    this.#weather = weather;
    this.#snapshot = Object.freeze({
      config,
      timeOfDay: tod,
      weather,
      webglAvailable: this.#webgl.available,
      webglReason: this.#webgl.reason,
    });
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch {
        // listener 错误被吞
      }
    }
  }
}

/** 工厂。 */
export function createPostFXPipeline(options?: PostFXPipelineOptions): PostFXPipeline {
  return new PostFXPipeline(options);
}

/**
 * 模块加载时校验 shader 源；与 VS4 一样，编译失败前先发现 shape 错误。
 */
export function validatePostFXShaders(): { vertex: true; fragment: true } {
  assertPostFXVertexShape(POSTFX_VERTEX_SOURCE);
  assertPostFXFragmentShape(POSTFX_FRAGMENT_SOURCE);
  return { vertex: true, fragment: true };
}

/** 内部工具：两个 PostFXConfig 是否完全相等。 */
function configsEqual(a: PostFXConfig, b: PostFXConfig): boolean {
  if (a.enabled !== b.enabled) return false;
  if (!bloomEqual(a.bloom, b.bloom)) return false;
  if (!vignetteEqual(a.vignette, b.vignette)) return false;
  return gradingEqual(a.colorGrading, b.colorGrading);
}

function bloomEqual(a: BloomConfig, b: BloomConfig): boolean {
  return a.threshold === b.threshold && a.intensity === b.intensity && a.radius === b.radius;
}

function vignetteEqual(a: VignetteConfig, b: VignetteConfig): boolean {
  return a.start === b.start && a.end === b.end && a.intensity === b.intensity;
}

function gradingEqual(a: ColorGradingConfig, b: ColorGradingConfig): boolean {
  return a.warmth === b.warmth && a.saturation === b.saturation && a.contrast === b.contrast;
}
