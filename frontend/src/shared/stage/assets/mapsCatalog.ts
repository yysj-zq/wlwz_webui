/**
 * 地图元数据契约（Stage maps catalog）。
 *
 * 设计目标：
 *  - **当前仅同福客栈大厅**（`tongfu_inn`）：历史正式 mapId，与后端 DEFAULT_MAP_ID 一致。
 *  - **三层必备**：collision / spawn / lighting，三者都缺时地图不可用。
 *  - **缺资产品牌化门闸**：地图 JSON / tileset / 任一层缺失 → 不伪造像素，
 *    上层（AssetGate）显示"戏未开场"。
 *  - **地图切换状态保持**：预留接口；近期无第二张地图。
 *  - **零网络可达即可用**：纯函数 + 纯数据；网络探测留给 AssetLoader。
 *
 * 与 manifest.ts 的关系：
 *  - manifest.ts 描述"URL 在哪"（基础设施）
 *  - mapsCatalog.ts 描述"地图的领域元数据"（维度 / spawn / lighting 摘要）
 *  - 二者通过 `MapManifestEntry` 关联
 */

import type { AssetManifest, MapManifestEntry } from '@shared/stage/assets';
import { MissingAssetError } from '@shared/stage/assets';
import type { LightDef, LightColor } from '@shared/stage/lighting';

// ───────── types ─────────

/** 地图 ID（slug；与 manifest.maps 的 key 对齐）。 */
export type MapId = string;

/** tile 坐标。 */
export type TilePosition = {
  readonly x: number;
  readonly y: number;
};

/** 玩家起始位置。 */
export type SpawnPoint = {
  readonly x: number;
  readonly y: number;
  /** 朝向（south/east/north/west）。 */
  readonly direction: 'south' | 'east' | 'north' | 'west';
};

/**
 * 碰撞层抽象：
 *  - `blocked`: 完全不可通行
 *  - `slow`: 通过但慢（用于灌木 / 楼梯等）
 *  - `actorsOnly`: 仅 NPC 可走，玩家不行
 */
export type CollisionKind = 'blocked' | 'slow' | 'actorsOnly';

/**
 * 单格碰撞标注（按 tile 索引）。
 * 不复制原始 JSON 的所有字段——只摘出渲染 + 决策必需。
 */
export type CollisionTile = {
  readonly x: number;
  readonly y: number;
  readonly kind: CollisionKind;
};

/**
 * 灯光标注层摘要：
 *  - 至少 3 盏 lantern + 2 扇 window（与 §A.2 对齐）
 *  - color 用 LightColor，便于 LightingLayerSpec 直接拼接
 */
export type LightingLayerSummary = {
  readonly lanterns: readonly LightDef[];
  readonly windows: readonly LightDef[];
  readonly ambient: LightColor;
};

/** 地图规格契约（业务层使用）。 */
export type MapSpec = {
  readonly mapId: MapId;
  /** 显示名（如「同福客栈·一层大厅」）。 */
  readonly displayName: string;
  /** tile 尺寸。 */
  readonly tileSize: { readonly w: number; readonly h: number };
  /** 地图尺寸（tiles）。 */
  readonly size: { readonly cols: number; readonly rows: number };
  /**
   * 仅用于地图切换 resume 兜底；会话内出生点权威是后端 world_state。
   * 数值须与 map.json 尺寸一致（tongfu_inn = 57×31）。
   */
  readonly playerSpawn: SpawnPoint;
  /**
   * 键盘移动用的碰撞瓦片（由 collision.json 栅格化填入）。
   * 空数组 = 仅做出界检查（碰撞尚未加载或文件为空）。
   */
  readonly collisionTiles: readonly CollisionTile[];
  /** 灯光标注层摘要。 */
  readonly lighting: LightingLayerSummary;
  /** URL 集合（与 manifest.maps[mapId] 一致）。 */
  readonly urls: MapManifestEntry;
  /** 是否"就绪可用"——manifest 命中 + tileset/collision/lighting URL 都填了。 */
  readonly ready: boolean;
  /** 缺失项描述（用于门闸显示）。 */
  readonly missing: readonly MissingAssetError[];
};

/** 地图切换时的瞬态状态保持。 */
export type MapStatePreservation = {
  readonly mapId: MapId;
  readonly playerPosition: TilePosition;
  readonly playerDirection: 'south' | 'east' | 'north' | 'west';
  readonly stateVersion: number;
  readonly lastVisitedAt: number;
};

// ───────── defaults ─────────

/** 同福客栈（当前唯一地图；与后端 DEFAULT_MAP_ID 一致）。 */
export const MAP_ID_TONGFU_INN = 'tongfu_inn';

/** 当前产品路径必备地图。 */
export const REQUIRED_MAP_IDS: ReadonlyArray<MapId> = Object.freeze([MAP_ID_TONGFU_INN]);

/** 默认 tile 尺寸（与 §A.2 一致）。 */
export const DEFAULT_TILE_SIZE: { readonly w: number; readonly h: number } = Object.freeze({
  w: 48,
  h: 48,
});

/** 默认地图尺寸（catalog 兜底；真实尺寸以 map.json 为准：tongfu_inn = 57×31）。 */
export const DEFAULT_MAP_SIZE: { readonly cols: number; readonly rows: number } = Object.freeze({
  cols: 57,
  rows: 31,
});

// ───────── 工厂 ─────────

/** 同福客栈默认 lighting（与 public/assets/maps/tongfu_inn/lighting.json 对齐）。 */
function defaultTongfuInnLighting(): LightingLayerSummary {
  const lanterns: LightDef[] = [
    {
      id: 'lantern-1',
      kind: 'lantern',
      position: { x: 19.418, y: 2.502 },
      radius: 120,
      color: { r: 1.0, g: 0.6901960784313725, b: 0.3764705882352941, intensity: 1.0 },
      flicker: { periodMs: 1800, amplitude: 0.12 },
    },
    {
      id: 'lantern-2',
      kind: 'lantern',
      position: { x: 32.303, y: 2.422 },
      radius: 120,
      color: { r: 1.0, g: 0.6901960784313725, b: 0.3764705882352941, intensity: 1.0 },
      flicker: { periodMs: 1800, amplitude: 0.12 },
    },
    {
      id: 'lantern-3',
      kind: 'lantern',
      position: { x: 40.86, y: 2.581 },
      radius: 120,
      color: { r: 1.0, g: 0.6901960784313725, b: 0.3764705882352941, intensity: 1.0 },
      flicker: { periodMs: 1800, amplitude: 0.12 },
    },
  ];
  const windows: LightDef[] = [
    {
      id: 'window-1',
      kind: 'window',
      position: { x: 46.777, y: 12.667 },
      radius: 180,
      color: { r: 0.6274509803921569, g: 0.7529411764705882, b: 1.0, intensity: 0.7 },
    },
    {
      id: 'window-2',
      kind: 'window',
      position: { x: 44.196, y: 1.827 },
      radius: 180,
      color: { r: 0.6274509803921569, g: 0.7529411764705882, b: 1.0, intensity: 0.7 },
    },
    {
      id: 'window-3',
      kind: 'window',
      position: { x: 33.594, y: 1.668 },
      radius: 180,
      color: { r: 0.6274509803921569, g: 0.7529411764705882, b: 1.0, intensity: 0.7 },
    },
  ];
  return Object.freeze({
    lanterns: Object.freeze(lanterns),
    windows: Object.freeze(windows),
    ambient: Object.freeze({ r: 0.85, g: 0.82, b: 0.72, intensity: 0.6 }),
  });
}

// ───────── spec factory ─────────

/**
 * 默认地图 catalog —— 当前仅 `tongfu_inn`。
 * 真实运行中由 manifest 的 URL 覆盖；本函数仅产出 domain 数据。
 */
export function defaultMapCatalog(): ReadonlyArray<MapSpec> {
  const tongfuInnUrls: MapManifestEntry = Object.freeze({
    json: `/assets/maps/${MAP_ID_TONGFU_INN}/map.json`,
    tileset: `/assets/maps/${MAP_ID_TONGFU_INN}/tileset.png`,
    lighting: `/assets/maps/${MAP_ID_TONGFU_INN}/lighting.json`,
    collision: `/assets/maps/${MAP_ID_TONGFU_INN}/collision.json`,
  });

  return Object.freeze([
    Object.freeze({
      mapId: MAP_ID_TONGFU_INN,
      displayName: '同福客栈',
      tileSize: DEFAULT_TILE_SIZE,
      size: DEFAULT_MAP_SIZE,
      // 与 roles.yaml player.spawn / map.json spawn 层 player 点对齐（权威仍在后端）
      playerSpawn: Object.freeze({ x: 50, y: 27, direction: 'south' as const }),
      // 启动时空表；GameShell / 加载器拉取 collision.json 后栅格化填入
      collisionTiles: Object.freeze([]),
      lighting: defaultTongfuInnLighting(),
      urls: tongfuInnUrls,
      ready: true,
      missing: Object.freeze([]),
    }),
  ]);
}

/** 用已栅格化的碰撞瓦片覆盖 MapSpec（不可变）。 */
export function withCollisionTiles(
  spec: MapSpec,
  collisionTiles: readonly CollisionTile[],
): MapSpec {
  return Object.freeze({
    ...spec,
    collisionTiles: Object.freeze([...collisionTiles]),
  });
}

/**
 * 合并 manifest 命中 + 默认 catalog：
 *  - 用 manifest.maps[mapId] 的 URL 覆盖默认
 *  - 缺 manifest 的地图仍按默认列出，但 ready=false
 *  - 返回列表：URL 是否齐全
 */
export function buildMapCatalog(
  manifest: AssetManifest,
  fallback: ReadonlyArray<MapSpec> = defaultMapCatalog(),
): ReadonlyArray<MapSpec> {
  const out: MapSpec[] = [];
  for (const spec of fallback) {
    const entry = manifest.maps[spec.mapId];
    if (!entry) {
      // 缺 manifest：保留占位 URL，但标 ready=false
      const missingErr = new MissingAssetError({
        assetKey: `maps:${spec.mapId}`,
        kind: 'map',
        url: spec.urls.json,
        reason: 'NOT_IN_MANIFEST',
      });
      out.push(
        Object.freeze({
          ...spec,
          urls: spec.urls,
          ready: false,
          missing: Object.freeze([missingErr]),
        }),
      );
      continue;
    }
    // 合并 URL；collision / lighting 缺失也降级
    const mergedUrls: MapManifestEntry = Object.freeze({
      json: entry.json,
      tileset: entry.tileset,
      ...(entry.lighting !== undefined ? { lighting: entry.lighting } : {}),
      ...(entry.collision !== undefined ? { collision: entry.collision } : {}),
    });
    const missing: MissingAssetError[] = [];
    if (!mergedUrls.json)
      missing.push(makeMissing(spec.mapId, 'map', mergedUrls.json, 'URL_NOT_FOUND'));
    if (!mergedUrls.tileset)
      missing.push(makeMissing(spec.mapId, 'tileset', mergedUrls.tileset, 'URL_NOT_FOUND'));
    if (!mergedUrls.lighting)
      missing.push(makeMissing(spec.mapId, 'lighting', '', 'URL_NOT_FOUND'));
    if (!mergedUrls.collision)
      missing.push(makeMissing(spec.mapId, 'collision', '', 'URL_NOT_FOUND'));
    out.push(
      Object.freeze({
        ...spec,
        urls: mergedUrls,
        ready: missing.length === 0,
        missing: Object.freeze(missing),
      }),
    );
  }
  return Object.freeze(out);
}

function makeMissing(
  mapId: string,
  kind: 'map' | 'tileset' | 'lighting' | 'collision',
  url: string,
  reason: 'URL_NOT_FOUND' | 'NOT_IN_MANIFEST',
): MissingAssetError {
  return new MissingAssetError({
    assetKey: `maps:${mapId}/${kind}`,
    kind,
    url,
    reason,
  });
}

// ───────── spawn / collision helpers ─────────

/**
 * 判断 tile 是否被碰撞层挡住（"blocked" 或 "actorsOnly" 阻挡玩家）。
 */
export function isTileBlocked(spec: MapSpec, pos: TilePosition, isPlayer: boolean): boolean {
  for (const t of spec.collisionTiles) {
    if (t.x !== pos.x || t.y !== pos.y) continue;
    if (t.kind === 'blocked') return true;
    if (t.kind === 'actorsOnly' && isPlayer) return true;
  }
  // 出界 = 视为 blocked
  if (pos.x < 0 || pos.y < 0 || pos.x >= spec.size.cols || pos.y >= spec.size.rows) {
    return true;
  }
  return false;
}

/**
 * 找到"未撞"邻居 tile（用于方向键移动时一次步长检测）。
 * 返回原始 `direction` 对应的下一格；若撞则返回原坐标 + null direction。
 */
export function stepInDirection(
  spec: MapSpec,
  from: TilePosition,
  direction: 'north' | 'south' | 'east' | 'west',
  isPlayer = true,
): { readonly x: number; readonly y: number; readonly hit: boolean } {
  let dx = 0;
  let dy = 0;
  switch (direction) {
    case 'north':
      dy = -1;
      break;
    case 'south':
      dy = 1;
      break;
    case 'east':
      dx = 1;
      break;
    case 'west':
      dx = -1;
      break;
  }
  const next = { x: from.x + dx, y: from.y + dy };
  const blocked = isTileBlocked(spec, next, isPlayer);
  if (blocked) return Object.freeze({ x: from.x, y: from.y, hit: true });
  return Object.freeze({ x: next.x, y: next.y, hit: false });
}

// ───────── state preservation ─────────

/** 地图状态保持 store（in-memory；页面刷新即清空，符合 turn_id 不持久假设）。 */
export type MapStateStore = {
  /** mapId → 上次离开时的瞬态。 */
  readonly entries: ReadonlyMap<MapId, MapStatePreservation>;
  remember(entry: MapStatePreservation): void;
  recall(mapId: MapId): MapStatePreservation | null;
  forget(mapId: MapId): void;
  forgetAll(): void;
};

/** 纯函数版本：snapshot → next，便于测试 / 序列化。 */
export function rememberOnMap(
  prev: ReadonlyMap<MapId, MapStatePreservation>,
  entry: MapStatePreservation,
): ReadonlyMap<MapId, MapStatePreservation> {
  const next = new Map(prev);
  next.set(entry.mapId, entry);
  return next;
}

export function recallFromMap(
  prev: ReadonlyMap<MapId, MapStatePreservation>,
  mapId: MapId,
): MapStatePreservation | null {
  return prev.get(mapId) ?? null;
}

/** 玩家由 A 地图切到 B 地图时调用：保存 A 状态；返回 B 恢复（若无 → spawn）。 */
export function transitionMapState(
  prev: ReadonlyMap<MapId, MapStatePreservation>,
  args: {
    readonly from: MapStatePreservation;
    readonly to: MapSpec;
    readonly now: number;
  },
): {
  readonly store: ReadonlyMap<MapId, MapStatePreservation>;
  readonly resume: MapStatePreservation;
} {
  const after = rememberOnMap(prev, args.from);
  const recalled = recallFromMap(after, args.to.mapId);
  if (recalled) return Object.freeze({ store: after, resume: recalled });
  // 兜底：用地图 playerSpawn
  const resume: MapStatePreservation = Object.freeze({
    mapId: args.to.mapId,
    playerPosition: { x: args.to.playerSpawn.x, y: args.to.playerSpawn.y },
    playerDirection: args.to.playerSpawn.direction,
    stateVersion: args.from.stateVersion,
    lastVisitedAt: args.now,
  });
  return Object.freeze({ store: after, resume });
}
