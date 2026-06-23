import { useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { clearConversationLocalStorage } from "#/utils/conversation-local-storage";

/**
 * Cancel + remove every cached query whose key references the given
 * conversation. After delete, those queries' next refetch would 404
 * against a gone resource — and our global queryCache.onError pops an
 * error toast for any non-silent 404. Killing them up-front fixes
 * "delete shows error toast despite success" (LeapBuilder KI-001).
 */
const purgeConversationQueries = (
  queryClient: QueryClient,
  conversationId: string,
) => {
  const isPerConv = (key: readonly unknown[] | undefined): boolean =>
    Array.isArray(key) && key.some((part) => part === conversationId);

  queryClient.cancelQueries({ predicate: (q) => isPerConv(q.queryKey) });
  queryClient.removeQueries({ predicate: (q) => isPerConv(q.queryKey) });
};

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Silence the global mutationCache error toast — we either succeed
    // (no toast needed) or we restore the optimistic list in onError
    // (also no toast — the user sees the conversation reappear).
    meta: { disableToast: true },
    mutationFn: (variables: { conversationId: string }) =>
      V1ConversationService.deleteConversation(variables.conversationId),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      // Stop any per-conversation polling BEFORE the DELETE round-trip,
      // so a slow 404-on-deleted-resource doesn't race with the success
      // path and pop a stale error toast.
      purgeConversationQueries(queryClient, variables.conversationId);

      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);

      queryClient.setQueryData(
        ["user", "conversations"],
        (old: { conversation_id: string }[] | undefined) =>
          old?.filter(
            (conv) => conv.conversation_id !== variables.conversationId,
          ),
      );

      return { previousConversations };
    },

    onSuccess: (_, variables) => {
      clearConversationLocalStorage(variables.conversationId);
      // Re-purge in case any per-conversation queries were re-started by
      // an effect during the round-trip.
      purgeConversationQueries(queryClient, variables.conversationId);
    },

    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
    },
  });
};
