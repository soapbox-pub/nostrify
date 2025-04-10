import { type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

export function useProfile(pubkey: string | undefined): NostrMetadata {
  const { nostr } = useNostr();

  const { data } = useQuery<NostrMetadata>({
    queryKey: ['profile', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query([{ kinds: [0], authors: [pubkey], limit: 1 }]);

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
    enabled: !!pubkey,
  });

  return data ?? {};
}
