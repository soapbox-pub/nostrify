import { useContext } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';

/**
 * Hook for accessing Nostr functionality within React components.
 *
 * Provides access to the relay pool, authenticated user, and login methods.
 * Must be used within a NostrProvider component.
 *
 * @returns The Nostr context with relay pool, user, and authentication methods
 * @throws Error if used outside of a NostrProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { nostr, user, login } = useNostr();
 *
 *   // Now you can access:
 *   // - nostr: for querying and publishing events
 *   // - user: the currently authenticated user
 *   // - login: methods to log in or out
 * }
 * ```
 */
export function useNostr(): NostrContextType {
  const context = useContext(NostrContext);

  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }

  return context;
}
