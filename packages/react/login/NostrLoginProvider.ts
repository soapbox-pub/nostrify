import { Fragment, jsx } from 'react/jsx-runtime';
import { useEffect, useReducer, useState } from 'react';

import { NostrLoginContext, type NostrLoginContextType } from './NostrLoginContext.ts';
import { type NLoginAction, nostrLoginReducer } from './nostrLoginReducer.ts';

import type { NLoginStorage } from './NLoginStorage.ts';
import type { NLoginType } from './NLogin.ts';
import type { FC, ReactNode } from 'react';

/** Props for `NostrLoginProvider`. */
interface NostrLoginProviderProps {
  /** The child components that will have access to the context. */
  children: ReactNode;
  /** The key used to store (and revive) the logins in storage. */
  storageKey: string;
  /** Custom storage backend. Defaults to `localStorage`. */
  storage?: NLoginStorage;
  /** Content to render while the login state is loading from storage. Defaults to `null`. */
  fallback?: ReactNode;
}

/** Inner component that holds the reducer and provides the context. Only mounts after storage has been read. */
const NostrLoginInner: FC<{
  children: ReactNode;
  initialLogins: NLoginType[];
  storageKey: string;
  storage: NLoginStorage;
}> = ({ children, initialLogins, storageKey, storage }) => {
  const [state, dispatch] = useReducer(nostrLoginReducer, initialLogins);

  useEffect(() => {
    storage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey, storage]);

  const value: NostrLoginContextType = {
    logins: state,
    addLogin: (login) => dispatch({ type: 'login.add', login }),
    removeLogin: (id) => dispatch({ type: 'login.remove', id }),
    setLogin: (id) => dispatch({ type: 'login.set', id }),
    clearLogins: () => dispatch({ type: 'login.clear' }),
  };

  return jsx(NostrLoginContext.Provider, { value, children });
};

/**
 * NostrLoginProvider is a React component that provides a context for managing Nostr logins.
 * It uses a reducer to handle the state of logins and persists them to a storage backend.
 *
 * The `storage` prop accepts any object with `getItem` and `setItem` methods, supporting
 * both synchronous (`localStorage`) and asynchronous (e.g. Capacitor Secure Storage) backends.
 * Defaults to `localStorage` when not provided.
 *
 * While the initial login state is being loaded from storage, the `fallback` prop is rendered
 * instead of `children`. Defaults to `null`.
 */
export const NostrLoginProvider: FC<NostrLoginProviderProps> = (
  { children, storageKey, storage = localStorage, fallback = null }: NostrLoginProviderProps,
) => {
  const [initialLogins, setInitialLogins] = useState<NLoginType[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(storage.getItem(storageKey)).then((stored) => {
      if (!cancelled) {
        setInitialLogins(stored ? JSON.parse(stored) : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey, storage]);

  if (initialLogins === null) {
    return jsx(Fragment, { children: fallback });
  }

  return jsx(NostrLoginInner, { initialLogins, storageKey, storage, children });
};
