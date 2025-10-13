import { NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/types';
import { useSuspenseQuery } from '@tanstack/react-query';

import { useNostr } from '../useNostr.ts';

export function useAuthor(
  pubkey: string | undefined,
): NostrMetadata & { event?: NostrEvent } {
  const { nostr } = useNostr();

  const { data } = useSuspenseQuery<NostrMetadata & { event?: NostrEvent }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) },
      );

      if (!event) {
        return {};
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { ...metadata, event };
      } catch {
        return { event };
      }
    },
  });

  return data;
}
