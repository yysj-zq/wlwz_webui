/**
 * played-role feature —— 切换会话扮演角色（Phase 5 PP2）。
 *
 * 包装 OpenAPI `setPlayedRole` mutation；页面只消费本 feature，不直接调 generated API。
 */
import { useCallback } from 'react';
import {
  useSetPlayedRoleEndpointApiConversationsConversationIdPlayedRolePost,
  type ConversationWorldRead,
} from '@shared/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@shared/api/queryClient';

export type SetPlayedRoleArgs = {
  readonly conversationId: number;
  readonly actorId: string;
};

export type UseSetPlayedRoleResult = {
  readonly setPlayedRole: (args: SetPlayedRoleArgs) => Promise<ConversationWorldRead>;
  readonly isPending: boolean;
  readonly error: Error | null;
};

/** 切换当前会话的扮演角色，并失效 world 查询。 */
export function useSetPlayedRole(): UseSetPlayedRoleResult {
  const queryClient = useQueryClient();
  const mutation = useSetPlayedRoleEndpointApiConversationsConversationIdPlayedRolePost();

  const setPlayedRole = useCallback(
    async ({ conversationId, actorId }: SetPlayedRoleArgs): Promise<ConversationWorldRead> => {
      const world = await mutation.mutateAsync({
        conversationId,
        data: { actorId },
      });
      // 立刻写入缓存：等待 refetch 会导致舞台仍按旧 kind 过滤点击
      queryClient.setQueryData(queryKeys.conversation.world(conversationId), world);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversation.world(conversationId),
      });
      return world;
    },
    [mutation, queryClient],
  );

  return {
    setPlayedRole,
    isPending: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error
        : mutation.error
          ? new Error('设置扮演角色失败')
          : null,
  };
}
