/**
 * TurnQueue 状态机 —— 按 conversationId 分桶。
 *
 * 状态迁移（单会话 slot）：
 *   idle → optimistic → in_flight → applying → idle
 *                                      ↘ error → idle
 *
 * 关键不变量：
 *  - POST /actions|/chat **不因切会话 abort**；结果写入发起该回合的会话 cache。
 *  - 仅取消「防抖尚未发出」的本地 pending（clear deferTimer）。
 *  - 同会话 busy（optimistic / in_flight / applying）时 **拒绝** 新 submit，不排队。
 *  - idle 下 deferMs 内多次 submit 只发最后一次（输入防抖，不是动作队列）。
 */
import { create } from 'zustand';
import type { WorldState, TimelineEntry, WorldEntityPatch } from '@shared/api';
import { isConflictResponse } from '@shared/api/conflict';
import { ApiError } from '@shared/api/mutator';

export type TurnPhase = 'idle' | 'optimistic' | 'in_flight' | 'applying' | 'error';

export type PendingAction = {
  speak?: string;
  actPatch?: WorldEntityPatch[];
  targetId?: string;
  actorId?: string;
  expectedStateVersion?: number;
};

export type TurnResult =
  | {
      kind: 'ok';
      worldState: WorldState;
      timelineDelta: TimelineEntry[];
      stateVersion: number;
    }
  | {
      kind: 'conflict';
      worldState: WorldState;
      currentStateVersion: number;
    }
  | {
      kind: 'error';
      error: Error;
    };

export type TurnExecutor = (a: PendingAction) => Promise<Exclude<TurnResult, { kind: 'error' }>>;

export type TurnSlot = {
  phase: TurnPhase;
  pending: PendingAction | null;
  deferTimer: ReturnType<typeof setTimeout> | null;
  lastError: Error | null;
  lastResult: TurnResult | null;
};

function emptySlot(): TurnSlot {
  return {
    phase: 'idle',
    pending: null,
    deferTimer: null,
    lastError: null,
    lastResult: null,
  };
}

function slotKey(conversationId: number): string {
  return String(conversationId);
}

function isBusy(phase: TurnPhase): boolean {
  return phase === 'optimistic' || phase === 'in_flight' || phase === 'applying';
}

export type TurnQueueStore = {
  slots: Record<string, TurnSlot>;
  deferMs: number;
  /**
   * 提交一轮动作。busy 时直接忽略并返回 false；
   * idle 下进入防抖窗口，到期后执行，返回 true。
   */
  submit: (conversationId: number, action: PendingAction, executor: TurnExecutor) => boolean;
  /** 仅清本地未发出的 debounce；不取消已发出的 HTTP。 */
  cancelPendingLocal: (conversationId: number) => void;
  /** 测试/显式重置 slot UI 态；不 abort 已发出请求（结果仍会写回 slot）。 */
  reset: (conversationId: number) => void;
  getSlot: (conversationId: number) => TurnSlot;
};

function patchSlot(
  slots: Record<string, TurnSlot>,
  key: string,
  patch: Partial<TurnSlot>,
): Record<string, TurnSlot> {
  const prev = slots[key] ?? emptySlot();
  return { ...slots, [key]: { ...prev, ...patch } };
}

export const useTurnQueueStore = create<TurnQueueStore>((set, get) => {
  const runExecute = (conversationId: number, action: PendingAction, executor: TurnExecutor) => {
    const key = slotKey(conversationId);
    set((s) => ({
      slots: patchSlot(s.slots, key, {
        phase: 'optimistic',
        pending: action,
        deferTimer: null,
        lastError: null,
      }),
    }));
    set((s) => ({
      slots: patchSlot(s.slots, key, { phase: 'in_flight' }),
    }));

    void (async () => {
      let result: TurnResult;
      try {
        result = await executor(action);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          if (isConflictResponse(err.body)) {
            result = {
              kind: 'conflict',
              worldState: err.body.worldState,
              currentStateVersion: err.body.currentStateVersion,
            };
          } else {
            result = {
              kind: 'error',
              error: new Error('conflict_response_unrecognized'),
            };
          }
        } else {
          result = {
            kind: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      }

      set((s) => ({
        slots: patchSlot(s.slots, key, {
          phase: 'applying',
          lastResult: result,
        }),
      }));

      set((s) => ({
        slots: patchSlot(s.slots, key, {
          phase: result.kind === 'error' ? 'error' : 'idle',
          pending: null,
          lastError: result.kind === 'error' ? result.error : null,
        }),
      }));
    })();
  };

  return {
    slots: {},
    deferMs: 80,

    getSlot: (conversationId) => {
      return get().slots[slotKey(conversationId)] ?? emptySlot();
    },

    submit: (conversationId, action, executor) => {
      const key = slotKey(conversationId);
      const slot = get().slots[key] ?? emptySlot();

      if (isBusy(slot.phase)) {
        return false;
      }

      if (slot.deferTimer) clearTimeout(slot.deferTimer);

      const deferMs = get().deferMs;
      const deferTimer = setTimeout(() => {
        runExecute(conversationId, action, executor);
      }, deferMs);

      set((s) => ({
        slots: patchSlot(s.slots, key, {
          deferTimer,
          pending: action,
          phase: 'idle',
          lastError: null,
        }),
      }));
      return true;
    },

    cancelPendingLocal: (conversationId) => {
      const key = slotKey(conversationId);
      const slot = get().slots[key];
      if (!slot) return;
      if (slot.deferTimer) clearTimeout(slot.deferTimer);
      set((s) => ({
        slots: patchSlot(s.slots, key, {
          deferTimer: null,
          pending: slot.phase === 'idle' ? null : slot.pending,
        }),
      }));
    },

    reset: (conversationId) => {
      const key = slotKey(conversationId);
      const slot = get().slots[key];
      if (slot?.deferTimer) clearTimeout(slot.deferTimer);
      set((s) => ({
        slots: patchSlot(s.slots, key, emptySlot()),
      }));
    },
  };
});

export const initialTurnPhase: TurnPhase = 'idle';
