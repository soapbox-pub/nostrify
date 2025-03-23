import { useEffect, useRef, useState } from 'react';

import { useNostr } from './useNostr.ts';

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

export interface UseNostrEvents {
  events: NostrEvent[];
  isFetching: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useNostrEvents(filters: NostrFilter[]): UseNostrEvents {
  const { nostr } = useNostr();

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const controller = useRef<AbortController>(undefined);
  const filtersId = filters.map((filter) => getFilterId(filter)).join(',');

  useEffect(() => {
    controller.current = new AbortController();
    return () => {
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsFetching(true);
    setError(null);

    nostr.query(filters, { signal: controller.current?.signal }).then((events) => {
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
  }, [filtersId, nostr]);

  return {
    events,
    isFetching,
    isLoading: isFetching && events.length === 0,
    isError,
    error,
  };
}

function getFilterId(filter: NostrFilter): string {
  const { limit: _, ...clone } = structuredClone(filter);

  const entries = Object.entries(clone)
    .filter(([_, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [_key, value] of entries) {
    if (Array.isArray(value)) {
      value.sort();
    }
  }

  return JSON.stringify(entries);
}
