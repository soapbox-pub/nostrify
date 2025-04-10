import { type Context, createContext } from 'react';

import type { NLogin } from './NLogin.ts';
import type { NLoginAction } from './nostrLoginReducer.ts';

/**
 * NostrLoginContextType defines the shape of the context that will be provided
 * to components that need access to the Nostr login state.
 */
export type NostrLoginContextType = [
  /** The list of Nostr logins. */
  state: NLogin[],
  /** A function to dispatch actions to update the login state. */
  dispatch: (action: NLoginAction) => void,
];

/**
 * NostrLoginContext is a React context that provides access to the Nostr login state and
 * a dispatch function to update the state.
 */
export const NostrLoginContext: Context<NostrLoginContextType | undefined> = createContext<
  NostrLoginContextType | undefined
>(undefined);
