// 客户端世界状态投影。
// 终态：与后端 backend/app/services/world_service.py::apply_world_patches 对齐——
// entity 顶层只接受 entity_id/position/direction/public_state/interactable；public_state 子键禁
// 写 memories/goal/inventory（这些走 ActorMind 表）。世界不再含 recent_events / seed_dialogue。
export const applyEntityPatches = (worldState, patches) => {
  if (!worldState || !patches || !patches.length) return worldState;
  const nextState = {
    ...worldState,
    entities: { ...(worldState.entities || {}) },
  };

  patches.forEach((patch) => {
    const entityId = patch.entity_id;
    if (!entityId) return;
    const current = nextState.entities[entityId];
    if (!current) return;
    nextState.entities[entityId] = {
      ...current,
      ...(patch.position && { position: { ...current.position, ...patch.position } }),
      ...(patch.direction != null && { direction: patch.direction }),
      ...(patch.interactable != null && { interactable: patch.interactable }),
      ...(patch.public_state && { public_state: { ...(current.public_state || {}), ...patch.public_state } }),
    };
  });

  return nextState;
};

// 合并多个 timeline_delta 条目的 act_patch 到 world_state，返回新 worldState。
export const applyTimelineDelta = (worldState, timelineDelta = []) => {
  let next = worldState;
  timelineDelta.forEach((entry) => {
    if (entry?.act_patch?.length) {
      next = applyEntityPatches(next, entry.act_patch);
    }
  });
  return next;
};
