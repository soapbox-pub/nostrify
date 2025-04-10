import { type Context, createContext } from 'react';

import type { NPool } from '@nostrify/nostrify';

/**
 * The shape of the Nostr context provided by NostrProvider.
 */
export interface NostrContextType {
  /** Name of the application used for storage keys and NIP-89 "client" tags. */
  appName: string;

  /** The Nostr relay pool for querying and publishing events */
  nostr: NPool;
}

/**
 * React context for Nostr functionality.
 * Use this with useContext or the useNostr hook to access Nostr features.
 */
export const NostrContext: Context<NostrContextType | undefined> = createContext<NostrContextType | undefined>(
  undefined,
);
