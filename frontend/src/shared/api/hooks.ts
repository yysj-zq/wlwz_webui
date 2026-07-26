/**
 * TanStack Query hooks 适配层（Phase 1 F1-3）。
 * 业务代码只用这些 hook，禁用直接调 orval 生成的 useXxx。
 *
 * 命名约定：useConversation/useTimeline/useWorld/useRoles 与 orval 解耦。
 * 全部直接吃 OpenAPI/orval 生成类型，无 normalize 适配层。
 */
import {
  useGetRolesApiRolesGet,
  useListConversationTimelineApiConversationsConversationIdTimelineGet,
  useListMyConversationsApiConversationsGet,
  useReadConversationWorldApiConversationsConversationIdWorldGet,
  type ConversationOut,
  type ConversationWorldRead,
  type RoleOut,
  type TimelineEntry,
} from '@shared/api';

import { queryKeys } from '@shared/api/queryClient';

export function useRoles() {
  return useGetRolesApiRolesGet<RoleOut[]>({
    query: {
      queryKey: queryKeys.roles.list(),
      staleTime: 5 * 60_000,
    },
  });
}

export function useConversations(options?: { enabled?: boolean; staleTime?: number }) {
  return useListMyConversationsApiConversationsGet<ConversationOut[]>({
    query: {
      queryKey: queryKeys.conversation.list(),
      enabled: options?.enabled ?? true,
      staleTime: options?.staleTime ?? 15_000,
    },
  });
}

export function useConversation(id: number | string | null | undefined) {
  const numericId = typeof id === 'string' ? Number(id) : id;
  return useListMyConversationsApiConversationsGet<ConversationOut | undefined>({
    query: {
      queryKey: queryKeys.conversation.detail(id),
      enabled: Number.isFinite(numericId),
      select: (data) => data.find((item) => item.id === numericId),
    },
  });
}

export function useTimeline(id: number | string | null | undefined) {
  const numericId = typeof id === 'string' ? Number(id) : id;
  return useListConversationTimelineApiConversationsConversationIdTimelineGet<TimelineEntry[]>(
    numericId ?? 0,
    undefined,
    {
      query: {
        queryKey: queryKeys.conversation.timeline(id),
        enabled: Number.isFinite(numericId),
      },
    },
  );
}

export function useWorld(id: number | string | null | undefined) {
  const numericId = typeof id === 'string' ? Number(id) : id;
  return useReadConversationWorldApiConversationsConversationIdWorldGet<ConversationWorldRead>(
    numericId ?? 0,
    {
      query: {
        queryKey: queryKeys.conversation.world(id),
        enabled: Number.isFinite(numericId),
      },
    },
  );
}
