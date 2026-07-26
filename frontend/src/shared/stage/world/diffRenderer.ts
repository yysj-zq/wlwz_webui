/**
 * World Diff Renderer（Phase 2 VS2 Spec §World 增量更新）。
 *
 * 关键约束（§Phase 2 §VS2）：
 *  1. **禁止全量销毁**：每次状态更新都必须产出最小化的 patch（按 entity_id），
 *     让 Phaser runtime 复用现有 sprite / 动画，避免重新创建导致 GPU/CPU 抖动。
 *  2. **不变更方向 / 资产 / 坐标的实体**一律视为 unchanged；只让真正改变
 *     的实体进入 `changed`，render 层据此调用 Phaser 的 transform / anim。
 *  3. **纯函数**：`diffWorldPatch` 不读任何外部 IO，单测可直接对照。
 *  4. **类型来自 OpenAPI 生成**（`@shared/api` 的 `WorldState`/`WorldEntity`），
 *     不复制实体模型。
 *
 * 与 entities/world/model.ts 的关系：
 *  - `model.ts` 提供"广义的 diff 数据"（包含 unchangedCount 等用于 UI 调试）
 *  - 本文件提供"面向 runtime 的 patch"，字段更精炼，只保留渲染需要的字段
 *    + 严格标记 entity_id。VS2 不依赖 entities/* 模块（保持 shared 边界）。
 */
import type { WorldEntity, WorldState } from '@shared/api';

/**
 * 单个新增 / 变更实体的渲染 patch。
 *
 * `intent` 让 render 层决定走哪条管线：
 *  - `enter` 新增：构建 sprite，apply 初始 transform / anim
 *  - `mutate` 增量：复用 sprite，只更新 position / direction / anim
 *  - `leave` 删除：fade-out 然后 destroy（不立即销毁，避免可见跳变）
 */
export type EntityIntent = 'enter' | 'mutate' | 'leave';

export type EntityPatch = {
  readonly entityId: string;
  readonly intent: EntityIntent;
  readonly entity: WorldEntity | null;
  /** 该实体的"上一个" WorldEntity，供 render 端做插值/方向变化。 */
  readonly previous: WorldEntity | null;
};

/** 单次 WorldState 切换产生的完整 patch（apply 全量，但内部实体级别增量）。 */
export type WorldDiffPatch = {
  readonly mapId: string;
  readonly stateVersion: number;
  readonly added: readonly EntityPatch[];
  readonly changed: readonly EntityPatch[];
  readonly removed: readonly EntityPatch[];
  /** 仅用于 UI 调试（Phase 1 diffWorldState 的 `unchangedCount`）。 */
  readonly unchangedCount: number;
};

/**
 * 比较 prev → next，产出 WorldDiffPatch。
 *
 * 输入边界：
 *  - prev === null → 视为"全实体新增"，仍按 entity_id 计算 added
 *  - next.entities 中没有 prev 的 entityId → removed
 *  - assetKey / position / direction / kind / interactable 任一变化 → changed，否则 unchanged
 *
 * 注意：与 `entities/world/model.ts` 的 diff 形态不同，本函数的结果直接喂给
 * Phaser runtime：
 *  - 没有 `unchangedCount` 重复（仅保留一处）
 *  - 直接给出 `intent` 决策，render 层不必再 if-else
 */
export function diffWorldPatch(prev: WorldState | null, next: WorldState): WorldDiffPatch {
  const prevEntities = (prev?.entities ?? {}) as Record<string, WorldEntity>;
  const nextEntities = next.entities as Record<string, WorldEntity>;

  const added: EntityPatch[] = [];
  const changed: EntityPatch[] = [];
  const removed: EntityPatch[] = [];
  let unchangedCount = 0;

  // 1. 走过 next，新增 / 变更 / 不变
  for (const [id, nextEntity] of Object.entries(nextEntities)) {
    const prevEntity = prevEntities[id];
    if (!prevEntity) {
      added.push({
        entityId: id,
        intent: 'enter',
        entity: nextEntity,
        previous: null,
      });
      continue;
    }

    const transformed = hasTransformChanged(prevEntity, nextEntity);
    if (transformed) {
      changed.push({
        entityId: id,
        intent: 'mutate',
        entity: nextEntity,
        previous: prevEntity,
      });
    } else {
      unchangedCount += 1;
    }
  }

  // 2. 走过 prev，找出 removed
  for (const [id, prevEntity] of Object.entries(prevEntities)) {
    if (!(id in nextEntities)) {
      removed.push({
        entityId: id,
        intent: 'leave',
        entity: null,
        previous: prevEntity,
      });
    }
  }

  return Object.freeze({
    mapId: next.mapId,
    stateVersion: next.stateVersion,
    added: Object.freeze(added),
    changed: Object.freeze(changed),
    removed: Object.freeze(removed),
    unchangedCount,
  });
}

/**
 * 渲染相关变化判定（VS2 §按 entity_id 增量更新）：
 * 位置 / 朝向 / 资产键 / kind / interactable 任一变化都算。
 *
 * kind / interactable 必须纳入：切换扮演角色会就地翻 PLAYER↔NPC，
 * 否则 sprite 可点击态不会随 mutate 管线更新。
 *
 * 注意：
 *  - 我们故意**不**判定 `publicState`（元数据）变化；那属于"业务/调试"维度，
 *    render 层不直接行动，留给 GameShell 通过 subscribe 读。
 */
function hasTransformChanged(a: WorldEntity, b: WorldEntity): boolean {
  if (a.position?.x !== b.position?.x) return true;
  if (a.position?.y !== b.position?.y) return true;
  if (a.direction !== b.direction) return true;
  if ((a.assetKey ?? null) !== (b.assetKey ?? null)) return true;
  if (a.kind !== b.kind) return true;
  if (Boolean(a.interactable) !== Boolean(b.interactable)) return true;
  return false;
}

/**
 * 把 patch 拆成"按 intent 分组"，方便 render 层用三条独立管线并行：
 *  - enter  → build sprite
 *  - mutate → apply transform / anim
 *  - leave  → fade out + destroy
 */
export function groupPatchByIntent(patch: WorldDiffPatch): {
  enter: readonly EntityPatch[];
  mutate: readonly EntityPatch[];
  leave: readonly EntityPatch[];
} {
  return Object.freeze({
    enter: Object.freeze(patch.added),
    mutate: Object.freeze(patch.changed),
    leave: Object.freeze(patch.removed),
  });
}

/**
 * 一帧内最大允许 mutate 数量。
 *
 * 防御性限流：单帧 mutate 超过 N 时只取前 N 个，其余顺延到下一帧。
 * 这是兜底，避免异常后端状态（如全部 NPC 同一帧转身）让 Phaser 同步风暴。
 * 默认 64，留给玩家 + 30 NPC × 4 帧足够。
 */
export const MAX_MUTATE_PER_FRAME = 64;

/** 简易预算钳制：把 mutate 列表按预算切分，余下推下一帧。 */
export function clampMutate(
  patches: readonly EntityPatch[],
  budget: number = MAX_MUTATE_PER_FRAME,
): { applied: readonly EntityPatch[]; deferred: readonly EntityPatch[] } {
  if (patches.length <= budget) {
    return Object.freeze({
      applied: Object.freeze(patches),
      deferred: Object.freeze([]),
    });
  }
  return Object.freeze({
    applied: Object.freeze(patches.slice(0, budget)),
    deferred: Object.freeze(patches.slice(budget)),
  });
}

/**
 * 调试用：对两个 WorldState 做 diff + 文本化输出，便于 Storybook / 控制台。
 * 真实产品中不调。
 */
export function summarizePatch(patch: WorldDiffPatch): string {
  const a = patch.added.map((p) => p.entityId).join(',');
  const c = patch.changed.map((p) => p.entityId).join(',');
  const r = patch.removed.map((p) => p.entityId).join(',');
  return (
    `[WorldDiff] v=${patch.stateVersion} map=${patch.mapId} ` +
    `+${patch.added.length}(${a}) ~${patch.changed.length}(${c}) -${patch.removed.length}(${r}) ` +
    `·unchanged=${patch.unchangedCount}`
  );
}
