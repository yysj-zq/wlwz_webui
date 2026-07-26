/**
 * HTTP 错误体唯一收窄点：ApiError.body 运行时为 unknown，
 * orval 不类型化 thrown error。成功路径禁止再做 unknown→DTO 适配。
 */
import type { ConflictResponse, WorldState } from '@shared/api';

function isWorldState(value: unknown): value is WorldState {
  if (!value || typeof value !== 'object') return false;
  const w = value as WorldState;
  return (
    typeof w.mapId === 'string' &&
    typeof w.stateVersion === 'number' &&
    typeof w.entities === 'object' &&
    w.entities !== null
  );
}

/** 将 409 响应体收窄为 ConflictResponse；形状不符返回 false。 */
export function isConflictResponse(body: unknown): body is ConflictResponse {
  if (!body || typeof body !== 'object') return false;
  const r = body as ConflictResponse;
  return (
    r.code === 'STATE_VERSION_CONFLICT' &&
    typeof r.currentStateVersion === 'number' &&
    isWorldState(r.worldState)
  );
}
