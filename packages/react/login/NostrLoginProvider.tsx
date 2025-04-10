import { type FC, type ReactNode } from 'react';

import { NostrLoginContext, NostrLoginContextType } from './NostrLoginContext.ts';
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
  const [logins, dispatch] = useNostrLoginReducer(storageKey);

  const value: NostrLoginContextType = {
    logins,
    addLogin: (login) => dispatch({ type: 'login.add', login }),
    removeLogin: (id) => dispatch({ type: 'login.remove', id }),
    setLogin: (id) => dispatch({ type: 'login.set', id }),
    clearLogins: () => dispatch({ type: 'login.clear' }),
  };

  return (
    <NostrLoginContext.Provider value={value}>
      {children}
    </NostrLoginContext.Provider>
  );
};
