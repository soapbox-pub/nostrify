import { type FC, type ReactNode, useEffect, useReducer } from 'react';

import { nostrLoginReducer } from './nostrLoginReducer.ts';
import { NostrLoginContext } from './NostrLoginContext.ts';

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
  const [state, dispatch] = useReducer(nostrLoginReducer, [], () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  return (
    <NostrLoginContext.Provider value={{ state, dispatch }}>
      {children}
    </NostrLoginContext.Provider>
  );
};
