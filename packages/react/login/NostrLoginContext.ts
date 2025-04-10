import { type Context, createContext } from 'react';

import type { NLoginType } from './NLogin.ts';

/**
 * NostrLoginContextType defines the shape of the context that will be provided
 * to components that need access to the Nostr login state.
 */
export type NostrLoginContextType = {
  /** The list of Nostr logins. */
  logins: readonly NLoginType[];
  /** Dispatch an action to add a login to the state. */
  addLogin: (login: NLoginType) => void;
  /** Dispatch an action to remove a login from the state. */
  removeLogin: (loginId: string) => void;
  /** Dispatch an action to set the user's current login (by moving it to the top of the state). */
  setLogin: (loginId: string) => void;
  /** Dispatch an action to clear the login state. */
  clearLogins: () => void;
};

/**
 * NostrLoginContext is a React context that provides access to the Nostr login state and
 * a dispatch function to update the state.
 */
export const NostrLoginContext: Context<NostrLoginContextType | undefined> = createContext<
  NostrLoginContextType | undefined
>(undefined);
