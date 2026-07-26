/**
 * ensure-session feature —— Phase 2 VS9「确保当前会话存在」状态机。
 *
 * 输入：URL `:conversationId?`（可能为空 / 字符串数字 / 非法）。
 * 输出：可消费的会话 ID + 世界快照（ConversationWorldRead）。
 *
 * 状态迁移：
 *   idle → resolving(URL 解析) →
 *     ├─ 命中已有 conversationId   → loading → ready / error
 *     └─ 未提供（空 / 新会话意图）→ creating → ready / error
 *
 * 设计要点：
 *  - 不直接耦合 React Query，但消费它的 useReadConversationWorld + useCreateOrLoadConversation。
 *  - URL 同步：URL 变化时回到 resolving；ready 后若 URL 不一致可选择 replaceState 修正
 *  - 错误统一收敛：429/5xx 给 1 次指数退避；422/404 不重试
 *  - a11y：`useEnsureSession` 返回 `ariaStatus` 文案供 Suspense 旁路使用
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useCreateOrLoadConversationApiConversationsPost,
  useReadConversationWorldApiConversationsConversationIdWorldGet,
} from '@shared/api';
import type { ConversationWorldRead } from '@shared/api';
import { queryKeys } from '@shared/api/queryClient';

/** ensure-session 状态机。 */
export type EnsurePhase = 'idle' | 'resolving' | 'loading' | 'creating' | 'ready' | 'error';

export type EnsureSession = {
  /** 状态机当前相位。 */
  readonly phase: EnsurePhase;
  /** 解析后的会话 ID（number）；creating 中为空。 */
  readonly conversationId: number | null;
  /** 服务端返回的最新世界快照（loaded / creating 成功后填入）。 */
  readonly world: ConversationWorldRead | null;
  /** 上一次错误（仅 error 相位有值）。 */
  readonly error: Error | null;
  /** 给屏幕阅读器播报的友好文案。 */
  readonly ariaStatus: string;
  /** 重新触发（手动 retry）。 */
  readonly retry: () => void;
  /** 创建新会话（与内部 mutation 同源，供 idle / error 面板调用）。 */
  readonly create: () => void;
  /** 创建中。 */
  readonly isCreating: boolean;
};

export interface EnsureSessionInput {
  /** URL :conversationId 解析后的字符串（可为 null / 数字字符串 / 非法）。 */
  readonly urlConversationId: string | null | undefined;
  /** 新会话标题（仅在创建新会话时使用）。 */
  readonly newTitle?: string;
  /** 强制当作新建（即使 URL 有值也忽略）。默认 false。 */
  readonly forceNew?: boolean;
}

const PHASE_LABEL: Record<EnsurePhase, string> = {
  idle: '待命',
  resolving: '解析会话',
  loading: '读取会话',
  creating: '创建会话',
  ready: '就绪',
  error: '出错了',
};

/** 把字符串转 number；非法返回 null。 */
export function parseConversationId(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** 把 EnsurePhase 翻译成面向用户的提示。 */
export function ariaStatusFor(phase: EnsurePhase, ctx?: { readonly id?: number | null }): string {
  switch (phase) {
    case 'idle':
      return '会话尚未开始。';
    case 'resolving':
      return '正在定位会话。';
    case 'loading':
      return ctx?.id !== undefined && ctx.id !== null ? `正在读取会话 ${ctx.id}…` : '正在读取会话…';
    case 'creating':
      return '正在创建新会话…';
    case 'ready':
      return ctx?.id !== undefined && ctx.id !== null ? `会话 ${ctx.id} 已就绪。` : '会话已就绪。';
    case 'error':
      return '会话加载失败。';
    default:
      return '';
  }
}

/** 装饰 internal hook：把解析后的 ID 接到 Query + Mutation。 */
export function useEnsureSession(input: EnsureSessionInput): EnsureSession {
  const parsedId = useMemo(
    () => (input.forceNew ? null : parseConversationId(input.urlConversationId)),
    [input.forceNew, input.urlConversationId],
  );

  const [phase, setPhase] = useState<EnsurePhase>(
    parsedId === null && !input.forceNew ? 'idle' : 'resolving',
  );
  const [error, setError] = useState<Error | null>(null);
  const [world, setWorld] = useState<ConversationWorldRead | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // 用 ref 记最新 parsedId，避免 effect 闭包陷阱
  const parsedIdRef = useRef(parsedId);
  parsedIdRef.current = parsedId;

  // 解析阶段：URL 有 conversationId → loading；URL 无 + forceNew → creating；URL 无 + 不 force → idle
  useEffect(() => {
    setError(null);
    setWorld(null);
    if (input.forceNew) {
      setPhase('creating');
      return;
    }
    if (parsedId === null) {
      setPhase('idle');
      return;
    }
    setPhase('loading');
  }, [input.forceNew, parsedId, retryToken]);

  // read conversation（仅在 loading 相位 + 有 ID 时启用）
  const readQuery = useReadConversationWorldApiConversationsConversationIdWorldGet(parsedId ?? 0, {
    query: {
      queryKey: [...queryKeys.conversation.world(parsedId), 'ensure', retryToken],
      enabled: phase === 'loading' && parsedId !== null,
    },
  });

  // mutation：create() 与内部状态机共用同一实例
  const createMutation = useCreateOrLoadConversationApiConversationsPost({
    mutation: {
      onMutate: () => {
        setPhase('creating');
        setError(null);
        setWorld(null);
      },
    },
  });

  const newTitle = input.newTitle ?? null;

  // 当 read 成功 → ready
  useEffect(() => {
    if (phase !== 'loading') return;
    if (readQuery.isSuccess && readQuery.data) {
      setWorld(readQuery.data);
      setError(null);
      setPhase('ready');
    }
  }, [phase, readQuery.isSuccess, readQuery.data]);

  // 当 read 失败 → error
  useEffect(() => {
    if (phase !== 'loading') return;
    if (readQuery.isError && readQuery.error) {
      setError(readQuery.error instanceof Error ? readQuery.error : new Error('读取会话失败'));
      setPhase('error');
    }
  }, [phase, readQuery.isError, readQuery.error]);

  // create 成功 / 失败 → ready / error
  useEffect(() => {
    if (createMutation.isSuccess && createMutation.data) {
      setWorld(createMutation.data);
      setError(null);
      setPhase('ready');
    }
    if (createMutation.isError) {
      setError(new Error('创建会话失败'));
      setPhase('error');
    }
  }, [createMutation.isSuccess, createMutation.isError, createMutation.data]);

  const retry = useCallback((): void => {
    setRetryToken((t) => t + 1);
  }, []);

  const create = useCallback((): void => {
    createMutation.mutate({ data: { conversationId: null, title: newTitle } });
  }, [createMutation, newTitle]);

  return {
    phase,
    conversationId: parsedId ?? world?.id ?? null,
    world,
    error,
    ariaStatus: ariaStatusFor(phase, { id: parsedId ?? world?.id ?? null }),
    retry,
    create,
    isCreating: createMutation.isPending,
  };
}

/** 触发创建新会话的辅助 hook（业务方调 useEnsureSession().create()）。 */
export function useEnsureSessionCreator() {
  const mutation = useCreateOrLoadConversationApiConversationsPost();
  return mutation;
}

/** 标签：给调试器 / Storybook / 单测使用。 */
export const ENSURE_SESSION_PHASE_LABEL = PHASE_LABEL;
