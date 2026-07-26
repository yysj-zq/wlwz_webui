/**
 * 地图碰撞层：解析 collision.json（多边形 / 矩形）并栅格化为 tile 碰撞表。
 *
 * 坐标约定与 Tiled / lighting 一致：浮点单位 = tile 坐标（非整型瓦片索引）。
 * 判定用 tile 中心点 (x+0.5, y+0.5)。
 */

export type CollisionPoint = {
  readonly x: number;
  readonly y: number;
};

export type CollisionPolygon = {
  readonly kind: 'polygon';
  readonly points: readonly CollisionPoint[];
  readonly name?: string;
};

export type CollisionRect = {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly name?: string;
};

export type CollisionShape = CollisionPolygon | CollisionRect;

export type CollisionDocument = {
  readonly blocked: readonly CollisionShape[];
};

export type RasterCollisionTile = {
  readonly x: number;
  readonly y: number;
  readonly kind: 'blocked';
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parsePoint(raw: unknown): CollisionPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteNumber(o.x) || !isFiniteNumber(o.y)) return null;
  return Object.freeze({ x: o.x, y: o.y });
}

function parseShape(raw: unknown): CollisionShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : undefined;

  if (o.kind === 'polygon') {
    if (!Array.isArray(o.points) || o.points.length < 3) return null;
    const points: CollisionPoint[] = [];
    for (const p of o.points) {
      const pt = parsePoint(p);
      if (!pt) return null;
      points.push(pt);
    }
    return Object.freeze({
      kind: 'polygon' as const,
      points: Object.freeze(points),
      ...(name !== undefined ? { name } : {}),
    });
  }

  if (o.kind === 'rect') {
    if (
      !isFiniteNumber(o.x) ||
      !isFiniteNumber(o.y) ||
      !isFiniteNumber(o.w) ||
      !isFiniteNumber(o.h) ||
      o.w <= 0 ||
      o.h <= 0
    ) {
      return null;
    }
    return Object.freeze({
      kind: 'rect' as const,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      ...(name !== undefined ? { name } : {}),
    });
  }

  return null;
}

/** 解析 collision.json；非法条目跳过，保留可解析形状。 */
export function parseCollisionDocument(raw: unknown): CollisionDocument {
  if (!raw || typeof raw !== 'object') {
    return Object.freeze({ blocked: Object.freeze([]) });
  }
  const blockedRaw = (raw as Record<string, unknown>).blocked;
  if (!Array.isArray(blockedRaw)) {
    return Object.freeze({ blocked: Object.freeze([]) });
  }
  const blocked: CollisionShape[] = [];
  for (const item of blockedRaw) {
    const shape = parseShape(item);
    if (shape) blocked.push(shape);
  }
  return Object.freeze({ blocked: Object.freeze(blocked) });
}

/** 射线法：点是否在多边形内（含边界近似）。 */
export function pointInPolygon(x: number, y: number, points: readonly CollisionPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersect =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInRect(
  x: number,
  y: number,
  rect: Pick<CollisionRect, 'x' | 'y' | 'w' | 'h'>,
): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function isPointBlocked(x: number, y: number, shapes: readonly CollisionShape[]): boolean {
  for (const shape of shapes) {
    if (shape.kind === 'rect') {
      if (pointInRect(x, y, shape)) return true;
    } else if (pointInPolygon(x, y, shape.points)) {
      return true;
    }
  }
  return false;
}

/**
 * 将碰撞形状栅格化为 tile 表（kind 恒为 blocked）。
 * 用每格中心采样，与键盘一步一格移动对齐。
 */
export function rasterizeCollisionTiles(
  doc: CollisionDocument,
  cols: number,
  rows: number,
): readonly RasterCollisionTile[] {
  if (cols <= 0 || rows <= 0 || doc.blocked.length === 0) {
    return Object.freeze([]);
  }
  const tiles: RasterCollisionTile[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isPointBlocked(x + 0.5, y + 0.5, doc.blocked)) {
        tiles.push(Object.freeze({ x, y, kind: 'blocked' as const }));
      }
    }
  }
  return Object.freeze(tiles);
}

/** 拉取并栅格化 collision.json。 */
export async function loadCollisionTiles(
  url: string,
  cols: number,
  rows: number,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly RasterCollisionTile[]> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`collision_load_failed:${res.status}`);
  }
  const raw: unknown = await res.json();
  return rasterizeCollisionTiles(parseCollisionDocument(raw), cols, rows);
}
