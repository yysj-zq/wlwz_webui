/**
 * World 实体：归一化 world_state、diff 算法（Phase 1 F1-2）。
 *
 * 渲染层（Phase 2 StageRuntime）用 diffRenderer.ts 按 entity_id 增量更新 transform/anim，
 * 这里只产出 plain diff 数据，不依赖 React 或 Phaser。
 */
import type { WorldEntity, WorldState } from '@shared/api';

export type { WorldEntity, WorldState };

export type WorldDiff = {
  added: WorldEntity[];
  removed: string[];
  changed: WorldEntity[];
  unchangedCount: number;
};

export function diffWorldState(prev: WorldState | null, next: WorldState): WorldDiff {
  const prevEntities = prev?.entities ?? {};
  const nextEntities = next.entities;

  const added: WorldEntity[] = [];
  const changed: WorldEntity[] = [];
  const removed: string[] = [];
  let unchangedCount = 0;

  for (const [id, e] of Object.entries(nextEntities)) {
    const before = prevEntities[id];
    if (!before) {
      added.push(e);
      continue;
    }
    if (
      before.position?.x !== e.position?.x ||
      before.position?.y !== e.position?.y ||
      before.direction !== e.direction ||
      before.assetKey !== e.assetKey
    ) {
      changed.push(e);
    } else {
      unchangedCount++;
    }
  }

  for (const id of Object.keys(prevEntities)) {
    if (!(id in nextEntities)) removed.push(id);
  }

  return { added, removed, changed, unchangedCount };
}

export function isPlayerActor(state: WorldState, actorId: string | null | undefined): boolean {
  if (!actorId) return false;
  return state.playerActorId === actorId;
}

export function entitiesByKind(
  state: WorldState,
  kind: 'player' | 'npc' | 'object',
): WorldEntity[] {
  return Object.values(state.entities).filter((e) => e.kind === kind);
}
