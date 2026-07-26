/**
 * TurnQueue React 绑定 —— 订阅指定 conversationId 的 slot。
 */
import {
  useTurnQueueStore,
  type PendingAction,
  type TurnPhase,
  type TurnResult,
  type TurnExecutor,
} from './model';

export type UseTurnQueue = {
  phase: TurnPhase;
  pending: PendingAction | null;
  lastError: Error | null;
  lastResult: TurnResult | null;
  /** busy 时返回 false，调用方应已用 phase 门闩禁止输入。 */
  submit: (action: PendingAction, executor: TurnExecutor) => boolean;
  cancelPendingLocal: () => void;
  reset: () => void;
};

const IDLE: UseTurnQueue = {
  phase: 'idle',
  pending: null,
  lastError: null,
  lastResult: null,
  submit: () => false,
  cancelPendingLocal: () => {},
  reset: () => {},
};

export function useTurnQueue(conversationId: number | null | undefined): UseTurnQueue {
  const id =
    typeof conversationId === 'number' && Number.isFinite(conversationId) ? conversationId : null;

  const phase = useTurnQueueStore((s) =>
    id == null ? 'idle' : (s.slots[String(id)]?.phase ?? 'idle'),
  );
  const pending = useTurnQueueStore((s) =>
    id == null ? null : (s.slots[String(id)]?.pending ?? null),
  );
  const lastError = useTurnQueueStore((s) =>
    id == null ? null : (s.slots[String(id)]?.lastError ?? null),
  );
  const lastResult = useTurnQueueStore((s) =>
    id == null ? null : (s.slots[String(id)]?.lastResult ?? null),
  );
  const submitStore = useTurnQueueStore((s) => s.submit);
  const cancelStore = useTurnQueueStore((s) => s.cancelPendingLocal);
  const resetStore = useTurnQueueStore((s) => s.reset);

  if (id == null) return IDLE;

  return {
    phase,
    pending,
    lastError,
    lastResult,
    submit: (action, executor) => submitStore(id, action, executor),
    cancelPendingLocal: () => cancelStore(id),
    reset: () => resetStore(id),
  };
}
