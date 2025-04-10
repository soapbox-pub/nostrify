import { type FC, type ReactNode } from 'react';

import { NostrLoginContext } from './NostrLoginContext.ts';
import { useNostrLoginReducer } from './useNostrLoginReducer.ts';

/** Props for `NostrLoginProvider`. */
interface NostrLoginProviderProps {
  /** The child components that will have access to the context. */
  children: ReactNode;
  /** The key used to store (and revive) the logins in localStorage. */
  storageKey: string;
}

/**
 * NostrLoginProvider is a React component that provides a context for managing Nostr logins.
 * It uses a reducer to handle the state of logins and stores them in localStorage.
 */
export const NostrLoginProvider: FC<NostrLoginProviderProps> = ({ children, storageKey }) => {
  const [state, dispatch] = useNostrLoginReducer(storageKey);

  return (
    <NostrLoginContext.Provider value={{ state, dispatch }}>
      {children}
    </NostrLoginContext.Provider>
  );
};
