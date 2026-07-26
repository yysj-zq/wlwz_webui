/**
 * 整数倍缩放（Phase 2 VS1 Spec §整数倍清晰）。
 *
 * 设计：
 *  - HD-2D 风格的舞台用逻辑 tile（参考 48×48 px），Phaser 内部以"设计分辨率"
 *    （默认 640×480）渲染，再按 viewport 整数倍放大到屏幕，避免双线性插值糊掉
 *    像素边缘。
 *  - 缩放计算是纯函数，与 Phaser 解耦，便于单测覆盖 1080p / 1440p / 4K。
 *  - 设备像素比（DPR）由浏览器 / Phaser 自身处理，与逻辑 scale 无关。
 *
 * 约束：
 *  - 仅 `INTEGER_FIT` 模式保证整数倍，其它模式返回的 `scale` 可为小数。
 *  - `scale >= 1`：若 viewport 比设计分辨率小，回退到 1（避免缩小到 0）。
 *  - 输出 `Object.freeze`，禁止内部状态被外部改写。
 */

/** 物理屏幕或 canvas 像素尺寸。 */
export type LogicalSize = {
  readonly width: number;
  readonly height: number;
};

/** 缩放模式（Phase 2 VS1 spec）。 */
export type ScaleMode = 'FIT' | 'INTEGER_FIT' | 'FILL' | 'ENVELOP';

/** 单次缩放计算结果。 */
export type ScaleResult = {
  readonly scale: number;
  /** 是否为整数倍；只有 INTEGER_FIT 模式可严格保证。 */
  readonly integer: boolean;
  readonly mode: ScaleMode;
  /** 应用到设计分辨率后的最终 canvas 像素尺寸。 */
  readonly canvas: LogicalSize;
  /** 是否出现黑边（FILL / ENVELOP 永远填满故为 false；FIT / INTEGER_FIT 可为 true）。 */
  readonly letterboxed: boolean;
};

/** Phase 2 同福客栈默认设计分辨率：32×20 tiles × 16/15 近似 640×480。 */
export const DEFAULT_DESIGN_SIZE: LogicalSize = Object.freeze({
  width: 640,
  height: 480,
});

/** 整数倍 FIT（Favored for HD-2D）：floor(min(vw/dw, vh/dh))。 */
export const SCALE_MODE_INTEGER_FIT: ScaleMode = 'INTEGER_FIT';

/** 等比 FIT（允许小数，保留全画面）。 */
export const SCALE_MODE_FIT: ScaleMode = 'FIT';

/** 等比 FILL：填满 viewport，可能裁切。 */
export const SCALE_MODE_FILL: ScaleMode = 'FILL';

/** 等比 ENVELOP：填满 viewport + letterbox（与 FILL 含义相同，仅语义区分）。 */
export const SCALE_MODE_ENVELOP: ScaleMode = 'ENVELOP';

/**
 * 计算当前 viewport 应采用的整数倍缩放。
 *
 * @param viewport  可见区域 / canvas 尺寸
 * @param design    设计分辨率（默认 640×480）
 * @param mode      缩放模式，默认 INTEGER_FIT
 */
export function computeIntegerScale(
  viewport: LogicalSize,
  design: LogicalSize = DEFAULT_DESIGN_SIZE,
  mode: ScaleMode = SCALE_MODE_INTEGER_FIT,
): ScaleResult {
  const vw = Math.max(1, Math.floor(viewport.width));
  const vh = Math.max(1, Math.floor(viewport.height));
  const dw = Math.max(1, Math.floor(design.width));
  const dh = Math.max(1, Math.floor(design.height));

  const fit = Math.min(vw / dw, vh / dh);
  const fill = Math.max(vw / dw, vh / dh);

  let scale: number;
  let letterboxed = false;

  switch (mode) {
    case 'INTEGER_FIT':
      scale = Math.max(1, Math.floor(fit));
      // 整数倍 FIT 一定小于等于 fit；若 < fit 视为出现黑边
      letterboxed = scale < fit - 1e-6;
      break;
    case 'FILL':
      scale = Math.max(1, fill);
      break;
    case 'ENVELOP':
      scale = Math.max(1, fill);
      letterboxed = true;
      break;
    case 'FIT':
    default:
      scale = Math.max(1, fit);
      letterboxed = true;
      break;
  }

  return Object.freeze({
    scale,
    integer: mode === 'INTEGER_FIT',
    mode,
    canvas: Object.freeze({
      width: Math.round(dw * scale),
      height: Math.round(dh * scale),
    }),
    letterboxed,
  });
}

/**
 * 判断给定缩放结果是否能保持锐利：
 * 仅 INTEGER_FIT 模式且 scale 与 floor 一致时返回 true。
 */
export function isSharpScale(result: ScaleResult): boolean {
  return result.mode === 'INTEGER_FIT' && Number.isInteger(result.scale);
}

/**
 * 世界相机整数缩放（整图总览）：避免非整数 zoom 导致双线性发糊。
 *
 * - 视口 ≥ 世界：`floor(fit)`，至少 1
 * - 视口 < 世界：`1/ceil(1/fit)`（½、⅓…），宁可留黑边也不用 0.89 这类分数 zoom
 */
export function computeIntegerWorldZoom(
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
): number {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const ww = Math.max(1, worldW);
  const wh = Math.max(1, worldH);
  const fit = Math.min(vw / ww, vh / wh);
  if (fit >= 1) {
    return Math.max(1, Math.floor(fit + 1e-9));
  }
  const denom = Math.max(1, Math.ceil(1 / fit - 1e-9));
  return 1 / denom;
}

/**
 * 探针：枚举常见 viewport × mode 的锐利矩阵，用于门禁（1080p / 1440p / 4K）。
 * 真实视觉验证仍需 Playwright 截图，但此函数给出 first-pass sanity check。
 */
export function sharpnessMatrix(
  designs: readonly LogicalSize[] = [DEFAULT_DESIGN_SIZE],
  viewports: readonly LogicalSize[] = [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ],
): ReadonlyArray<{ design: LogicalSize; viewport: LogicalSize; sharp: boolean; scale: number }> {
  return designs.flatMap((design) =>
    viewports.map((viewport) => {
      const r = computeIntegerScale(viewport, design, 'INTEGER_FIT');
      return { design, viewport, sharp: isSharpScale(r), scale: r.scale };
    }),
  );
}
