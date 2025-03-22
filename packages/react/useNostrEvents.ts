import { useEffect, useState } from 'react';

import { useNostr } from './useNostr.ts';

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

export interface UseNostrEvents {
  events: NostrEvent[];
  isFetching: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface UseNostrEventsOpts {
  enabled?: boolean;
}

export function useNostrEvents(filters: NostrFilter[], opts: UseNostrEventsOpts = {}): UseNostrEvents {
  const { nostr } = useNostr();
  const { enabled } = opts;

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (enabled) {
      setIsFetching(true);
      setError(null);

      nostr.query(filters).then((events) => {
        setEvents(events);
        setIsFetching(false);
      }).catch((error) => {
        if (error instanceof Error) {
          setError(error);
        } else {
          setError(new Error('An unknown error occurred'));
        }
        setIsError(true);
        setIsFetching(false);
      });
    }
  }, [filters, nostr, enabled]);

  return {
    events,
    isFetching,
    isLoading: isFetching && events.length === 0,
    isError,
    error,
  };
}
