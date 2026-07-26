/**
 * TanStack Query 客户端 + QueryKey 工厂（Phase 1 F1-3）。
 *
 * 设计要点：
 *  - QueryKey 工厂统一形状 `[domain, scope, ...args]`，便于 invalidate 与 cache 调试。
 *  - 默认 staleTime 30s、retry 1，避免乐观锁 409 被自动 retry 风暴。
 *  - 401 默认抛错；Phase 5 PP3 全局重试时替换 mutationCache.config。
 */
import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  conversation: {
    all: ['conversation'] as const,
    list: () => ['conversation', 'list'] as const,
    detail: (id: number | string | null | undefined) =>
      ['conversation', 'detail', id ?? 'none'] as const,
    timeline: (id: number | string | null | undefined) =>
      ['conversation', 'timeline', id ?? 'none'] as const,
    world: (id: number | string | null | undefined) =>
      ['conversation', 'world', id ?? 'none'] as const,
  },
  roles: {
    all: ['roles'] as const,
    list: () => ['roles', 'list'] as const,
  },
  auth: {
    me: () => ['auth', 'me'] as const,
  },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // 不自动 retry：409 冲突必须由前端 reconcile，不能被静默吞掉
      retry: 0,
    },
  },
});

export type QueryKeyFactory = typeof queryKeys;
