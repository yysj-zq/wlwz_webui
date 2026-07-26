/**
 * 角色图集 (atlas) + 法线图 (normal) 索引契约（Phase 4 GR1 Spec §AtlasManifest）。
 *
 * 设计目标：
 *  - **零网络可达即可用**：本模块纯函数 + 纯数据，jsdom / Node 单测可直接对照
 *  - **缺失即降级**：单角色 atlas 缺失不会让 Phaser runtime 崩；走
 *    `MissingAssetError` 路径统一门闸（"戏未开场"），不伪造 PNG
 *  - **方向 × 动作 × 帧**：约定"横条拼接" — `direction × animation × frame`
 *    → 单帧 (x, y, w, h)；`pickFrame(atlas, assetKey, direction, animation, frameIndex)`
 *    返回帧 rect 供 Phaser 切帧
 *  - **法线图可选**：缺 normalMap 时降级到 ambient-only；不阻塞渲染
 *
 * 与 manifest.ts 的关系：
 *  - manifest.ts 描述"URL 在哪"（基础设施）
 *  - atlas.ts 描述"URL 对应的 atlas 内怎么切帧"（领域知识）
 *  - 二者通过 `CharacterManifestEntry` 里的 `meta` URL 关联
 *
 * 用法：
 * ```ts
 * const meta = await fetchCharacterAtlasMeta('baizhantang');
 * const rect = pickFrame(meta, 'south', 'idle', 0);
 * // → { x: 0, y: 0, w: 64, h: 96 }
 * ```
 */
import type { AssetManifest, CharacterManifestEntry } from '@shared/stage/assets';
import { MissingAssetError } from '@shared/stage/assets';

/** 角色朝向（与 WorldEntity.direction 对齐）。 */
export type Direction = 'south' | 'east' | 'north' | 'west';

/** 角色动作（动画）。 */
export type Animation = 'idle' | 'walk' | 'speak';

/**
 * 方向枚举（与 §A.3 规范对齐）：
 *  - south = 朝相机（默认 / 正面）
 *  - east  = 右
 *  - north = 背
 *  - west  = 左
 */
export const DIRECTIONS: readonly Direction[] = ['south', 'east', 'north', 'west'];

/** 动画枚举。 */
export const ANIMATIONS: readonly Animation[] = ['idle', 'walk', 'speak'];

/**
 * 单帧矩形（atlas 内部坐标，单位：px）。
 *
 * 用于驱动 Phaser 的 setFrame / setTexture 切片调用。
 */
export type FrameRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/**
 * TexturePacker 风格的 atlas 元数据（裁剪自 `atlas.json`）。
 *
 * 约定（§A.3）：
 *  - `frameSize`: { w, h } = 单帧像素（64x96 起步，2x = 128x192）
 *  - `frames`: key → { x, y, w, h, offX?, offY?, sourceW?, sourceH? }
 *  - `meta.image`: atlas PNG 的逻辑尺寸（用于 fallback 校验）
 *  - `meta.animations`（可选）：name → { directions, frames }
 *
 * 这里**不**用 hash 表的 JSON 原样——只摘出业务必需的字段，避免引入外部库。
 */
export type AtlasFrame = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly offX?: number;
  readonly offY?: number;
};

export type AtlasFrameMeta = {
  /** atlas image 路径（来自 manifest.characters[slug].atlas）。 */
  readonly image: string;
  /** atlas image 尺寸。 */
  readonly size: { readonly w: number; readonly h: number };
  /** 单帧尺寸（约定所有帧一致）。 */
  readonly frameSize: { readonly w: number; readonly h: number };
  /** 所有帧，按 key 索引；key 形如 "south/idle/0"。 */
  readonly frames: Readonly<Record<string, AtlasFrame>>;
};

/** 单角色完整 atlas 描述（业务侧消费形态）。 */
export type CharacterAtlas = {
  readonly slug: string;
  readonly atlasUrl: string;
  readonly normalUrl: string | null;
  readonly meta: AtlasFrameMeta | null;
  /**
   * 是否"就绪可用"：meta 加载成功 + atlasUrl 命中 → true。
   * false 时调用方走门闸，**不**自己造 sprite。
   */
  readonly ready: boolean;
  /** 缺失原因（与 MissingAssetError.reason 对齐）。 */
  readonly missing: ReadonlyArray<MissingAssetError>;
};

/**
 * 默认帧尺寸（与 §A.3 "64×96 px" 对齐）。
 * TexturePacker 的真实尺寸可能更大（2x = 128x192），但业务逻辑按逻辑帧
 * 尺寸处理；Phaser runtime 在 boot 时按 scale 倍数放大。
 */
export const DEFAULT_FRAME_SIZE: { readonly w: number; readonly h: number } = Object.freeze({
  w: 64,
  h: 96,
});

/**
 * 默认 atlas 尺寸（32 帧横条 = 4 方向 × 4 idle；再加 walk/speak 各 4 帧）。
 * 仅为"manifest 未加载"时的兜底占位；真实值由 atlas.json 提供。
 */
export const DEFAULT_ATLAS_SIZE: { readonly w: number; readonly h: number } = Object.freeze({
  w: 1024,
  h: 256,
});

/**
 * 帧 key 标准化：direction + animation + frameIndex。
 *
 * 约定 key 顺序（与 §A.3 "横条拼接：方向 × 动画 × 帧" 对齐）：
 *   index = directionIdx * (animations * framesPerAnim) + animationIdx * framesPerAnim + frameIdx
 *
 * 例如 direction=south, animation=idle, frameIndex=0 → "south/idle/0"
 */
export function makeFrameKey(
  direction: Direction,
  animation: Animation,
  frameIndex: number,
): string {
  return `${direction}/${animation}/${frameIndex}`;
}

/**
 * 从帧 key 反解 direction + animation + frameIndex。
 * 非法 key 返回 null（不抛错；调用方走门闸）。
 */
export function parseFrameKey(key: string): {
  readonly direction: Direction;
  readonly animation: Animation;
  readonly frameIndex: number;
} | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;
  const dirRaw = parts[0] ?? '';
  const animRaw = parts[1] ?? '';
  const idxRaw = parts[2] ?? '';
  if (!(DIRECTIONS as readonly string[]).includes(dirRaw)) return null;
  if (!(ANIMATIONS as readonly string[]).includes(animRaw)) return null;
  const idx = Number.parseInt(idxRaw, 10);
  if (!Number.isFinite(idx) || idx < 0) return null;
  return {
    direction: dirRaw as Direction,
    animation: animRaw as Animation,
    frameIndex: idx,
  };
}

/**
 * 计算"横条拼接"约定下的默认 frame 位置（atlas.json 缺失时 fallback）。
 *
 * 假定 atlas 布局：
 *   行为 direction（south=0, east=1, north=2, west=3）
 *   列为 animation × framesPerAnim
 *   单帧宽 = frameSize.w
 *   单帧高 = frameSize.h
 */
export function defaultFrameRect(
  direction: Direction,
  animation: Animation,
  frameIndex: number,
  frameSize: { readonly w: number; readonly h: number } = DEFAULT_FRAME_SIZE,
): FrameRect {
  const dirIdx = DIRECTIONS.indexOf(direction);
  const animIdx = ANIMATIONS.indexOf(animation);
  const safeDir = dirIdx < 0 ? 0 : dirIdx;
  const safeAnim = animIdx < 0 ? 0 : animIdx;
  const safeFrame = frameIndex < 0 ? 0 : frameIndex;
  // 行内 frames 按方向纵向排列；帧序列在行内从左到右
  return Object.freeze({
    x: safeFrame * frameSize.w,
    y: (safeDir * ANIMATIONS.length + safeAnim) * frameSize.h,
    w: frameSize.w,
    h: frameSize.h,
  });
}

/**
 * 从 AtlasFrameMeta 取出 (direction, animation, frameIndex) 对应的 FrameRect。
 * 若 meta 中无该 key 或 meta 为 null → 返回 defaultFrameRect(...) 兜底。
 */
export function pickFrame(
  meta: AtlasFrameMeta | null,
  direction: Direction,
  animation: Animation,
  frameIndex: number,
): FrameRect {
  if (!meta) {
    return defaultFrameRect(direction, animation, frameIndex);
  }
  const key = makeFrameKey(direction, animation, frameIndex);
  const frame = meta.frames[key];
  if (!frame) {
    return defaultFrameRect(direction, animation, frameIndex, meta.frameSize);
  }
  return Object.freeze({ x: frame.x, y: frame.y, w: frame.w, h: frame.h });
}

/**
 * 默认 atlas meta 工厂：给出 32 帧（4 方向 × 3 动画 × 平均 4 帧）占位。
 * 用于 atlas.json 缺失时 — 渲染层据此走 defaultFrameRect 切帧。
 */
export function emptyAtlasFrameMeta(imageUrl: string): AtlasFrameMeta {
  const frames: Record<string, AtlasFrame> = {};
  for (const dir of DIRECTIONS) {
    for (const anim of ANIMATIONS) {
      const FRAMES_PER_ANIM = 4;
      for (let i = 0; i < FRAMES_PER_ANIM; i++) {
        const key = makeFrameKey(dir, anim, i);
        const rect = defaultFrameRect(dir, anim, i);
        frames[key] = Object.freeze({
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
        });
      }
    }
  }
  return Object.freeze({
    image: imageUrl,
    size: DEFAULT_ATLAS_SIZE,
    frameSize: DEFAULT_FRAME_SIZE,
    frames: Object.freeze(frames),
  });
}

/**
 * 从 AssetManifest.characters[slug] 派生一个 CharacterAtlas。
 *
 * 这是 GR1 的"工厂"入口：业务层调它做 manifest → domain 转换。
 * 该函数不会触发网络 IO；URL 是否可达由 AssetLoader 在另一阶段完成。
 *
 * 返回的 `ready=false` 时：
 *  - 调用方应走"戏未开场"门闸
 *  - **不**伪造 sprite / normalMap 像素
 *  - meta 用 emptyAtlasFrameMeta 兜底（仅供切帧的占位逻辑，不参与渲染）
 */
export function buildCharacterAtlas(manifest: AssetManifest, slug: string): CharacterAtlas {
  const entry: CharacterManifestEntry | undefined = manifest.characters[slug];
  if (!entry) {
    return Object.freeze({
      slug,
      atlasUrl: '',
      normalUrl: null,
      meta: emptyAtlasFrameMeta(''),
      ready: false,
      missing: Object.freeze([
        new MissingAssetError({
          assetKey: `characters:${slug}/atlas`,
          kind: 'atlas',
          url: '',
          reason: 'NOT_IN_MANIFEST',
        }),
      ]),
    });
  }
  return Object.freeze({
    slug,
    atlasUrl: entry.atlas,
    normalUrl: entry.normal ?? null,
    meta: emptyAtlasFrameMeta(entry.atlas),
    ready: true,
    missing: Object.freeze([]),
  });
}

/**
 * in_game 角色（除 player）必须有 atlas；与 backend/config/roles.yaml + manifest 对齐。
 * 由 `pnpm check:assets` 门禁强制；本列表供 summarizeCharacters 启动体检。
 */
export const REQUIRED_CHARACTER_SLUGS: ReadonlyArray<string> = Object.freeze([
  'baizhantang',
  'tongxiangyu',
  'guofurong',
  'lvxiucai',
  'lidazui',
  'moxiaobei',
  'zhuwushuang',
  'yanxiaoliu',
  'xingyusen',
]);

/**
 * 列出 manifest 里所有角色 slug 的"就绪态"。
 * 用于 GameShell 启动前体检（"戏未开场"门闸触发条件之一）。
 */
export function summarizeCharacters(
  manifest: AssetManifest,
): ReadonlyArray<{ slug: string; ready: boolean; reason: string }> {
  const out: { slug: string; ready: boolean; reason: string }[] = [];
  for (const slug of Object.keys(manifest.characters)) {
    const entry = manifest.characters[slug];
    if (!entry) {
      out.push({ slug, ready: false, reason: 'NOT_IN_MANIFEST' });
      continue;
    }
    out.push({ slug, ready: true, reason: 'OK' });
  }
  for (const required of REQUIRED_CHARACTER_SLUGS) {
    if (manifest.characters[required]) continue;
    out.push({ slug: required, ready: false, reason: 'MISSING_REQUIRED' });
  }
  return Object.freeze(out);
}

/**
 * 把 TexturePacker / webui atlas.json 解析为 AtlasFrameMeta。
 * 非法结构返回 null（调用方走矩形 fallback，不伪造帧）。
 */
export function parseAtlasJson(raw: unknown, imageUrl: string): AtlasFrameMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const framesRaw = root.frames;
  if (!framesRaw || typeof framesRaw !== 'object') return null;

  const frames: Record<string, AtlasFrame> = {};
  for (const [key, value] of Object.entries(framesRaw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const rectSrc =
      entry.frame && typeof entry.frame === 'object'
        ? (entry.frame as Record<string, unknown>)
        : entry;
    const x = Number(rectSrc.x);
    const y = Number(rectSrc.y);
    const w = Number(rectSrc.w);
    const h = Number(rectSrc.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) continue;
    const spriteSource =
      entry.spriteSourceSize && typeof entry.spriteSourceSize === 'object'
        ? (entry.spriteSourceSize as Record<string, unknown>)
        : null;
    const offX = Number(entry.offX ?? spriteSource?.x);
    const offY = Number(entry.offY ?? spriteSource?.y);
    frames[key] = Object.freeze({
      x,
      y,
      w,
      h,
      ...(Number.isFinite(offX) ? { offX } : {}),
      ...(Number.isFinite(offY) ? { offY } : {}),
    });
  }
  if (Object.keys(frames).length === 0) return null;

  const metaRaw =
    root.meta && typeof root.meta === 'object' ? (root.meta as Record<string, unknown>) : {};
  const sizeRaw =
    metaRaw.size && typeof metaRaw.size === 'object'
      ? (metaRaw.size as Record<string, unknown>)
      : null;
  const frameSizeRaw =
    metaRaw.frameSize && typeof metaRaw.frameSize === 'object'
      ? (metaRaw.frameSize as Record<string, unknown>)
      : null;
  const first = Object.values(frames)[0]!;
  const sizeW = Number(sizeRaw?.w);
  const sizeH = Number(sizeRaw?.h);
  const frameW = Number(frameSizeRaw?.w);
  const frameH = Number(frameSizeRaw?.h);

  return Object.freeze({
    image: typeof metaRaw.image === 'string' ? metaRaw.image : imageUrl,
    size: Object.freeze({
      w: Number.isFinite(sizeW) && sizeW > 0 ? sizeW : DEFAULT_ATLAS_SIZE.w,
      h: Number.isFinite(sizeH) && sizeH > 0 ? sizeH : DEFAULT_ATLAS_SIZE.h,
    }),
    frameSize: Object.freeze({
      w: Number.isFinite(frameW) && frameW > 0 ? frameW : first.w,
      h: Number.isFinite(frameH) && frameH > 0 ? frameH : first.h,
    }),
    frames: Object.freeze(frames),
  });
}

/**
 * 从 entity.assetKey / entity.id 解析 manifest.characters 的 slug。
 *
 * 只允许精确命中 manifest.characters[candidate]（可剥离 `characters:` 前缀）。
 * 对不上则返回 null，由调用方走矩形 fallback。
 */
export function resolveCharacterSlug(
  manifest: AssetManifest,
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (!candidate) return null;

  const prefixed = /^characters:([^/]+)/i.exec(candidate);
  if (prefixed?.[1]) candidate = prefixed[1];

  if (manifest.characters[candidate]) return candidate;

  return null;
}
