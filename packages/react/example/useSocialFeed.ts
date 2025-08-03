import { useSuspenseQuery, type UseSuspenseQueryResult } from '@tanstack/react-query';

import { useNostr } from '../useNostr.js';

import type { NostrEvent } from '@nostrify/nostrify';

export function useSocialFeed(): UseSuspenseQueryResult<NostrEvent[]> {
  const { nostr } = useNostr();

  return useSuspenseQuery({
    queryKey: ['social-feed'],
    queryFn: () =>
      nostr.query(
        [{ kinds: [1], limit: 5 }],
        { signal: AbortSignal.timeout(5000) },
      ),
  });
}
