/**
 * CPU 烘焙 lightMap：把 LightingSnapshot 的点光源写入 RGBA 缓冲。
 *
 * 编码（与 light2d.frag 一致）：
 *  - RGB = 累加后的光源色（[0,1] → byte）
 *  - A   = 累加强度（供 `light.rgb * light.a * u_lightScale`）
 *
 * 坐标：光源在 **相机视口空间** 栅格化（与 `u_lightMap` 的 outTexCoord 对齐）。
 * tile → 世界像素用 `tileSize`；再减去 scroll、乘 zoom 得到视口像素。
 * 半径单位为逻辑像素（设计分辨率），烘焙时随 zoom 缩放。
 */
import type { LightDef } from './Light2DPipeline';

export type BakeLightMapOptions = {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly lights: readonly LightDef[];
  readonly flickerOffsets: readonly number[];
  /** 写入目标；长度须 ≥ width*height*4。未传则分配新缓冲。 */
  readonly target?: Uint8ClampedArray;
  /** 相机视口左上角（世界像素）；缺省 0 = 世界原点对齐缓冲左上。 */
  readonly scrollX?: number;
  readonly scrollY?: number;
  /** 相机 zoom；缺省 1。 */
  readonly zoom?: number;
  /**
   * 相机视口像素尺寸（与 setScroll 使用的 cam.width/height 一致）。
   * 缺省等于 width/height（缓冲即视口）。当 lightMap 为设计分辨率、
   * Phaser canvas 为整数倍放大时必须传入，以便把视口坐标映射到缓冲。
   */
  readonly viewWidth?: number;
  readonly viewHeight?: number;
};

export type BakedLightMap = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

/**
 * 平法线占位色 RGB(128,128,255) — 与 §A / shader 约定一致。
 */
export const FLAT_NORMAL_RGB = Object.freeze({ r: 128, g: 128, b: 255 });

/**
 * 抽样检测是否为平法线占位（全图接近 RGB(128,128,255)）。
 */
export function isFlatNormalPlaceholder(
  data: ArrayLike<number>,
  width: number,
  height: number,
  tolerance = 2,
): boolean {
  if (width <= 0 || height <= 0 || data.length < 4) return true;
  const samples = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), Math.floor(height / 2)],
  ] as const;
  for (const [sx, sy] of samples) {
    const i = (sy * width + sx) * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (
      Math.abs(r - FLAT_NORMAL_RGB.r) > tolerance ||
      Math.abs(g - FLAT_NORMAL_RGB.g) > tolerance ||
      Math.abs(b - FLAT_NORMAL_RGB.b) > tolerance
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 将光源栅格化到 RGBA8 lightMap。
 */
export function bakeLightMap(options: BakeLightMapOptions): BakedLightMap {
  const { width, height, tileSize, lights, flickerOffsets } = options;
  if (width <= 0 || height <= 0) {
    throw new Error('[lighting] bakeLightMap: width/height must be > 0');
  }
  const size = width * height * 4;
  const data = options.target ?? new Uint8ClampedArray(size);
  if (data.length < size) {
    throw new Error('[lighting] bakeLightMap: target buffer too small');
  }
  data.fill(0);

  const invTile = tileSize > 0 ? tileSize : 1;
  const scrollX = options.scrollX ?? 0;
  const scrollY = options.scrollY ?? 0;
  const zoom = options.zoom !== undefined && options.zoom > 0 ? options.zoom : 1;
  const viewW =
    options.viewWidth !== undefined && options.viewWidth > 0 ? options.viewWidth : width;
  const viewH =
    options.viewHeight !== undefined && options.viewHeight > 0 ? options.viewHeight : height;
  const sx = width / viewW;
  const sy = height / viewH;
  const radiusScale = Math.min(sx, sy);

  for (let li = 0; li < lights.length; li++) {
    const light = lights[li];
    if (!light || light.kind === 'ambient') continue;
    const flicker = flickerOffsets[li] ?? 0;
    const intensity = Math.max(0, light.color.intensity * (1 + flicker));
    if (intensity <= 0.001) continue;

    const cx = (light.position.x * invTile - scrollX) * zoom * sx;
    const cy = (light.position.y * invTile - scrollY) * zoom * sy;
    const radius = Math.max(1, light.radius * zoom * radiusScale);
    const r2 = radius * radius;

    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));

    const cr = light.color.r;
    const cg = light.color.g;
    const cb = light.color.b;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / radius;
        const contrib = falloff * falloff * intensity;
        if (contrib <= 0.001) continue;

        const idx = (y * width + x) * 4;
        const prevA = (data[idx + 3] ?? 0) / 255;
        const nextA = Math.min(1, prevA + contrib);
        const w = nextA > 0 ? contrib / nextA : 0;
        const prevR = (data[idx] ?? 0) / 255;
        const prevG = (data[idx + 1] ?? 0) / 255;
        const prevB = (data[idx + 2] ?? 0) / 255;
        data[idx] = Math.round(Math.min(1, prevR * (1 - w) + cr * w) * 255);
        data[idx + 1] = Math.round(Math.min(1, prevG * (1 - w) + cg * w) * 255);
        data[idx + 2] = Math.round(Math.min(1, prevB * (1 - w) + cb * w) * 255);
        data[idx + 3] = Math.round(nextA * 255);
      }
    }
  }

  return { width, height, data };
}

/**
 * 填充平法线 RGBA 缓冲（RGB(128,128,255), A=255）。
 */
export function fillFlatNormalMap(
  width: number,
  height: number,
  target?: Uint8ClampedArray,
): Uint8ClampedArray {
  const size = width * height * 4;
  const data = target ?? new Uint8ClampedArray(size);
  for (let i = 0; i < size; i += 4) {
    data[i] = FLAT_NORMAL_RGB.r;
    data[i + 1] = FLAT_NORMAL_RGB.g;
    data[i + 2] = FLAT_NORMAL_RGB.b;
    data[i + 3] = 255;
  }
  return data;
}
