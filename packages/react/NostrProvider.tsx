import { NostrSigner, NPool, type NRelay, NRelay1 } from '@nostrify/nostrify';
import { useEffect, useReducer, useRef } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';
import { nostrReducer } from './nostrReducer.ts';

interface NostrProviderProps {
  storageKey?: string;
  children: React.ReactNode;
  relays: Array<`wss://${string}` | `ws://${string}`>;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ children, relays: relayUrls, storageKey = 'nostr' }) => {
  const [state, dispatch] = useReducer(nostrReducer, undefined, () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : { logins: [] };
  });

  const pool = useRef<NRelay>(undefined);

  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        return new Map(relayUrls.map((url) => [url, filters]));
      },
      eventRouter() {
        return relayUrls;
      },
    });
  }

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const context: NostrContextType = {
    nostr: pool.current,
    state,
    dispatch,
    windowSigner: (globalThis as unknown as { nostr?: NostrSigner }).nostr,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
