/**
 * Phaser 4 PostFX — 用内置 Filters 驱动 PostFXPipeline 快照。
 *
 *  - Bloom：`ParallelFilters` + Threshold + Blur + ADD blend
 *  - Vignette：`addVignette`
 *  - Color grading：`addColorMatrix`（saturate / contrast / hue≈warmth）
 *
 * 全部 WebGL；禁止 canvas.style.filter。
 */
import type Phaser from 'phaser';
import type { PostFXSnapshot } from './PostFXPipeline';

export type PostFXFilterHandles = {
  readonly bloom: Phaser.Filters.ParallelFilters;
  readonly bloomThreshold: Phaser.Filters.Threshold;
  readonly bloomBlur: Phaser.Filters.Blur;
  readonly vignette: Phaser.Filters.Vignette;
  readonly colorMatrix: Phaser.Filters.ColorMatrix;
};

type PhaserNS = typeof Phaser;

/**
 * 在 camera.filters.external 上挂载 Bloom / Vignette / ColorMatrix。
 * 失败抛错（不做 CSS 兜底）。
 */
export function attachPostFXFilters(
  PhaserNS: PhaserNS,
  camera: Phaser.Cameras.Scene2D.Camera,
): PostFXFilterHandles {
  const list = camera.filters.external;
  if (!list || typeof list.addParallelFilters !== 'function') {
    throw new Error('[postfx] camera.filters.external unavailable');
  }

  const bloom = list.addParallelFilters();
  const bloomThreshold = bloom.top.addThreshold(0.62, 1);
  const bloomBlur = bloom.top.addBlur(0, 2, 2, 1, 0xffffff, 4);
  bloom.blend.blendMode = PhaserNS.BlendModes.ADD;
  bloom.blend.amount = 0.55;

  const vignette = list.addVignette(0.5, 0.5, 0.55, 0.45, 0x000000);
  const colorMatrix = list.addColorMatrix();

  return { bloom, bloomThreshold, bloomBlur, vignette, colorMatrix };
}

/**
 * 用 PostFXSnapshot 刷新内置 filter 参数。
 */
export function applyPostFXSnapshot(
  handles: PostFXFilterHandles,
  snap: Readonly<PostFXSnapshot>,
): void {
  const enabled = snap.config.enabled;
  handles.bloom.setActive(enabled);
  handles.vignette.setActive(enabled);
  handles.colorMatrix.setActive(enabled);
  if (!enabled) return;

  const { bloom, vignette, colorGrading } = snap.config;

  handles.bloomThreshold.setEdge(bloom.threshold, 1);
  const blurPx = Math.max(1, Math.min(32, bloom.radius / 2));
  handles.bloomBlur.x = blurPx;
  handles.bloomBlur.y = blurPx;
  handles.bloomBlur.strength = Math.max(0.1, bloom.intensity);
  handles.bloom.blend.amount = Math.max(0, Math.min(1.5, bloom.intensity));

  // start/end → 半径取 end；强度直接映射
  handles.vignette.radius = Math.max(0.05, Math.min(1.2, vignette.end));
  handles.vignette.strength = Math.max(0, Math.min(1, vignette.intensity));

  const cm = handles.colorMatrix.colorMatrix;
  cm.reset();
  // warmth → 轻微 hue（暖偏黄橙）；saturation / contrast 直连
  if (Math.abs(colorGrading.warmth) > 0.001) {
    cm.hue(colorGrading.warmth * 18, true);
  }
  if (Math.abs(colorGrading.saturation) > 0.001) {
    cm.saturate(colorGrading.saturation, true);
  }
  if (Math.abs(colorGrading.contrast) > 0.001) {
    cm.contrast(colorGrading.contrast, true);
  }
}
