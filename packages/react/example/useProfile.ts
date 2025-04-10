import { type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser.ts';

export function useProfile(): UseQueryResult<NostrMetadata> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrMetadata>({
    queryKey: ['profile', user?.pubkey ?? ''],
    queryFn: async () => {
      if (!user) {
        return {};
      }

      const [event] = await nostr.query([{ kinds: [0], authors: [user.pubkey], limit: 1 }]);

      if (!event) {
        return {};
      }

      try {
        return n.json().pipe(n.metadata()).parse(event.content);
      } catch (error) {
        console.error(error);
        return {};
      }
    },
    enabled: !!user,
  });
}
