import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useNostr } from '../useNostr.ts';

import type { NostrEvent } from '@nostrify/nostrify';

export function useSocialFeed(): UseQueryResult<NostrEvent[]> {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['social-feed'],
    queryFn: () => nostr.query([{ kinds: [1], limit: 20 }]),
  });
}
