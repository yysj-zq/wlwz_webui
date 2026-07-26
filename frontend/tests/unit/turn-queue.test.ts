/**
 * TurnQueue 按 conversationId 分桶单测。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTurnQueueStore, type TurnPhase } from '@features/turn-queue/model';
import { ApiError } from '@shared/api/mutator';
import type { WorldState, TimelineEntry } from '@shared/api';

const CID = 7;

const FAKE_WORLD: WorldState = {
  mapId: 'tongfu_inn',
  stateVersion: 1,
  playerActorId: 'player',
  entities: { player: { id: 'player', name: '玩家', kind: 'player', position: { x: 0, y: 0 } } },
};

const FAKE_DELTA: TimelineEntry[] = [];

const okResult = {
  kind: 'ok' as const,
  worldState: { ...FAKE_WORLD, stateVersion: 2 },
  timelineDelta: FAKE_DELTA,
  stateVersion: 2,
};
const conflictResult = {
  kind: 'conflict' as const,
  worldState: { ...FAKE_WORLD, stateVersion: 99 },
  currentStateVersion: 99,
};
const okExecutor = () => async (): Promise<typeof okResult> => {
  await Promise.resolve();
  return okResult;
};
const conflictExecutor = () => async (): Promise<typeof conflictResult> => {
  await Promise.resolve();
  return conflictResult;
};

const conflictApiExecutor = (): (() => Promise<never>) => () =>
  Promise.reject(
    new ApiError(409, 'conflict', {
      code: 'STATE_VERSION_CONFLICT',
      currentStateVersion: 42,
      worldState: { ...FAKE_WORLD, stateVersion: 42 },
    }),
  );

const conflictApiSnakeExecutor = (): (() => Promise<never>) => () =>
  Promise.reject(
    new ApiError(409, 'conflict', {
      code: 'STATE_VERSION_CONFLICT',
      current_state_version: 43,
      world_state: { ...FAKE_WORLD, stateVersion: 43 },
    }),
  );

function slot() {
  return useTurnQueueStore.getState().getSlot(CID);
}

describe('TurnQueue 状态机（按会话）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTurnQueueStore.setState({ slots: {}, deferMs: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state: phase = idle', () => {
    expect(slot().phase).toBe<TurnPhase>('idle');
  });

  it('迁移 1: idle → optimistic → in_flight → applying → idle (ok)', async () => {
    const seen: TurnPhase[] = [slot().phase];
    const unsub = useTurnQueueStore.subscribe((s) => {
      const p = s.slots[String(CID)]?.phase ?? 'idle';
      if (seen[seen.length - 1] !== p) seen.push(p);
    });

    useTurnQueueStore.getState().submit(CID, { speak: 'hi' }, okExecutor());
    await vi.advanceTimersByTimeAsync(20);
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(seen).toEqual(['idle', 'optimistic', 'in_flight', 'applying', 'idle']);
    expect(slot().lastResult?.kind).toBe('ok');
    unsub();
  });

  it('迁移 2: 409 conflict → applying → idle', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    useTurnQueueStore.getState().submit(CID, {}, conflictExecutor());
    await vi.runAllTimersAsync();
    await Promise.resolve();
    const r = slot().lastResult;
    expect(r?.kind).toBe('conflict');
    if (r?.kind === 'conflict') {
      expect(r.currentStateVersion).toBe(99);
    }
    expect(slot().phase).toBe<TurnPhase>('idle');
  });

  it('迁移 3: ApiError(409) → conflict', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    useTurnQueueStore.getState().submit(CID, {}, conflictApiExecutor());
    await vi.runAllTimersAsync();
    await Promise.resolve();
    const r = slot().lastResult;
    expect(r?.kind).toBe('conflict');
    if (r?.kind === 'conflict') {
      expect(r.currentStateVersion).toBe(42);
    }
  });

  it('迁移 3b: snake_case 409 → error', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    useTurnQueueStore.getState().submit(CID, {}, conflictApiSnakeExecutor());
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(slot().phase).toBe<TurnPhase>('error');
    const r = slot().lastResult;
    expect(r?.kind).toBe('error');
    if (r?.kind === 'error') {
      expect(r.error.message).toBe('conflict_response_unrecognized');
    }
  });

  it('迁移 4: 通用错误 → phase=error', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    const failExecutor = () => () => Promise.reject(new Error('boom'));
    useTurnQueueStore.getState().submit(CID, {}, failExecutor());
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(slot().phase).toBe<TurnPhase>('error');
    expect(slot().lastError?.message).toBe('boom');
  });

  it('cancelPendingLocal 只清 debounce，不取消已发出请求', async () => {
    useTurnQueueStore.setState({ deferMs: 50 });
    let started = 0;
    const exec = () => async () => {
      started += 1;
      await Promise.resolve();
      return okResult;
    };
    useTurnQueueStore.getState().submit(CID, {}, exec());
    useTurnQueueStore.getState().cancelPendingLocal(CID);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(started).toBe(0);
    expect(slot().phase).toBe('idle');
  });

  it('in_flight 期间切到另一会话不影响其 slot', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    let resolve!: (v: typeof okResult) => void;
    const hang = () =>
      new Promise<typeof okResult>((r) => {
        resolve = r;
      });
    useTurnQueueStore.getState().submit(CID, {}, () => hang());
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(slot().phase).toBe('in_flight');

    useTurnQueueStore.getState().submit(8, { speak: 'other' }, okExecutor());
    await vi.runAllTimersAsync();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(useTurnQueueStore.getState().getSlot(8).lastResult?.kind).toBe('ok');
    expect(slot().phase).toBe('in_flight');

    resolve(okResult);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(slot().phase).toBe('idle');
    expect(slot().lastResult?.kind).toBe('ok');
  });

  it('防抖: idle 下 deferMs 内多次 submit 只发一次', async () => {
    useTurnQueueStore.setState({ deferMs: 50 });
    const calls: number[] = [];
    const exec = (id: number) => () => {
      calls.push(id);
      return Promise.resolve({ ...okResult, stateVersion: id });
    };
    const { submit } = useTurnQueueStore.getState();
    expect(submit(CID, {}, exec(1))).toBe(true);
    expect(submit(CID, {}, exec(2))).toBe(true);
    expect(submit(CID, {}, exec(3))).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(calls).toEqual([3]);
  });

  it('busy 时 submit 被拒绝，结束后不会自动再发', async () => {
    useTurnQueueStore.setState({ deferMs: 1 });
    let resolve!: (v: typeof okResult) => void;
    const hang = () =>
      new Promise<typeof okResult>((r) => {
        resolve = r;
      });
    let secondCalls = 0;
    const second = () => {
      secondCalls += 1;
      return Promise.resolve(okResult);
    };

    expect(useTurnQueueStore.getState().submit(CID, { speak: 'first' }, () => hang())).toBe(true);
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(slot().phase).toBe('in_flight');

    expect(useTurnQueueStore.getState().submit(CID, { speak: 'queued?' }, second)).toBe(false);

    resolve(okResult);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(slot().phase).toBe('idle');
    expect(secondCalls).toBe(0);
    expect(slot().lastResult?.kind).toBe('ok');
  });
});
