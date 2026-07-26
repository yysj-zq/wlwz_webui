/**
 * Speech Cues（Phase 2 VS3 Spec §舞台短气泡）。
 *
 * 关键约束：
 *  - **只显示"谁在说话 + 前几个字"**：完整台词进 NarrativeRail。
 *  - **每角色头顶常驻最新一句**：同 actor 新发言覆盖旧句；多角色可同时展示。
 *  - 默认不过期（expiresAt=0）；可选 durationMs 做限时（测试/特效）。
 *  - 不依赖 React / Phaser；纯数据结构 + 几何函数。
 *
 * 数据流：
 *   TimelineEntry → createStageCue / setSpeechCues →
 *   PhaserRuntime 每帧 latestCuesByActor() → 多气泡 DOM overlay
 */

import type { WorldEntity } from '@shared/api';

/** 单个短气泡描述：谁、几个字、何时过期。 */
export type SpeechCue = {
  /** actor 的 entity id（与 WorldEntity.id 对齐）。 */
  readonly actorId: string;
  /** 展示用中文名（避免依赖 roles store 同步就绪）。 */
  readonly actorName: string;
  /** 提取的短文本（已被 `buildCueExcerpt` 截断 + 行规范化）。 */
  readonly excerpt: string;
  /** 该 cue 开始时间（performance.now() ms）。 */
  readonly startedAt: number;
  /** 该 cue 到期时间；过期后不再展示。0 表示永不（常驻最新一句）。 */
  readonly expiresAt: number;
};

/** 屏幕坐标（CSS 像素）— 与 viewport 像素一致。 */
export type ScreenPoint = {
  readonly x: number;
  readonly y: number;
};

/** 屏幕视口尺寸：用于把 world tile 映射回 css 像素。 */
export type ViewportSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * 把时间线文本归一化为气泡 excerpt：
 *  - 去除首尾空白
 *  - 截断到 `maxChars`（默认 14 字，含标点）
 *  - 末尾加省略号「…」表明还有后续
 */
export const DEFAULT_CUE_MAX_CHARS = 14;

/** 0 = 常驻不过期（生产默认）。 */
export const DEFAULT_CUE_DURATION_MS = 0;

const FULLWIDTH_PUNCT = /[，。！？；：、（）《》「」『』]/g;
const ELLIPSIS = '…';

export function buildCueExcerpt(raw: string, maxChars: number = DEFAULT_CUE_MAX_CHARS): string {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  const normalized = raw.replace(/[\u3000\s]+/g, ' ').trim();
  if (normalized.length === 0) return '';
  if (normalized.length <= maxChars) {
    return stripTrailingPunctuation(normalized);
  }
  const sliced = Array.from(normalized).slice(0, maxChars).join('');
  return `${sliced}${ELLIPSIS}`;
}

function stripTrailingPunctuation(text: string): string {
  let s = text;
  while (s.length > 0 && /[，！？。；：、.,!?;:]$/u.test(s)) {
    s = s.slice(0, -1);
  }
  void FULLWIDTH_PUNCT;
  return s;
}

/**
 * 创建一个 cue。
 *
 * `durationMs <= 0` → expiresAt=0（常驻）；否则 now + durationMs。
 */
export function makeCue(
  actorId: string,
  actorName: string,
  text: string,
  now: number,
  durationMs: number = DEFAULT_CUE_DURATION_MS,
  maxChars: number = DEFAULT_CUE_MAX_CHARS,
): SpeechCue {
  const excerpt = buildCueExcerpt(text, maxChars);
  const permanent = durationMs <= 0;
  return Object.freeze({
    actorId,
    actorName,
    excerpt,
    startedAt: now,
    expiresAt: excerpt.length === 0 || permanent ? 0 : now + durationMs,
  });
}

function isCueAlive(cue: SpeechCue, now: number): boolean {
  if (cue.excerpt.length === 0) return false;
  if (cue.expiresAt === 0) return true;
  return cue.expiresAt > now;
}

/**
 * 每个 actor 取最新一条仍有效的 cue（多角色同时展示）。
 *
 * 规则：
 *  - 同 actorId 只保留 startedAt 最大的一条
 *  - expiresAt=0 永不过期；expiresAt>0 且已过期则丢弃
 *  - excerpt 为空不展示
 */
export function latestCuesByActor(cues: readonly SpeechCue[], now: number): readonly SpeechCue[] {
  if (cues.length === 0) return Object.freeze([]);
  const byActor = new Map<string, SpeechCue>();
  for (const cue of cues) {
    if (!isCueAlive(cue, now)) continue;
    const prev = byActor.get(cue.actorId);
    if (!prev || cue.startedAt >= prev.startedAt) {
      byActor.set(cue.actorId, cue);
    }
  }
  return Object.freeze([...byActor.values()]);
}

/**
 * @deprecated 单气泡时代遗留；请用 {@link latestCuesByActor}。
 * 返回所有 actor 中 startedAt 最新的一条。
 */
export function pickActiveCue(cues: readonly SpeechCue[], now: number): SpeechCue | null {
  const active = latestCuesByActor(cues, now);
  let latest: SpeechCue | null = null;
  for (const cue of active) {
    if (!latest || cue.startedAt > latest.startedAt) latest = cue;
  }
  return latest;
}

/**
 * 折叠为每 actor 最新一条，并丢掉已过期 cue。
 */
export function pruneExpired(cues: readonly SpeechCue[], now: number): readonly SpeechCue[] {
  return latestCuesByActor(cues, now);
}

/**
 * 把 WorldEntity 的 tile 坐标投影到舞台容器 CSS 像素（与 Atmosphere 粒子同源）。
 */
export const DEFAULT_TILE_SIZE_PX = 48;
/** 精灵 origin 在脚底；偏上约一角色身高，气泡落在头顶附近。 */
export const DEFAULT_BUBBLE_OFFSET_Y = -56;

export type CueCameraView = {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly viewW: number;
  readonly viewH: number;
};

export function projectCueAnchor(
  entity: WorldEntity | null,
  camera: CueCameraView,
  tileSize: number = DEFAULT_TILE_SIZE_PX,
  offsetY: number = DEFAULT_BUBBLE_OFFSET_Y,
): ScreenPoint {
  if (!entity || !entity.position) {
    return {
      x: Math.round(camera.cssWidth / 2),
      y: 32,
    };
  }
  const worldX = entity.position.x * tileSize;
  const worldY = entity.position.y * tileSize;
  const scaleX = camera.cssWidth / (camera.viewW || 1);
  const scaleY = camera.cssHeight / (camera.viewH || 1);
  const x = (worldX - camera.scrollX) * camera.zoom * scaleX;
  const y = (worldY - camera.scrollY) * camera.zoom * scaleY + offsetY;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * 工厂：根据 actor + 文本 → 常驻短气泡（默认不过期）。
 */
export function createStageCue(args: {
  readonly actor: WorldEntity;
  readonly actorName: string;
  readonly text: string;
  readonly now: number;
  readonly durationMs?: number;
  readonly maxChars?: number;
}): SpeechCue {
  return makeCue(
    args.actor.id,
    args.actorName,
    args.text,
    args.now,
    args.durationMs ?? DEFAULT_CUE_DURATION_MS,
    args.maxChars ?? DEFAULT_CUE_MAX_CHARS,
  );
}
