import { NostrSigner, NPool, NRelay1 } from '@nostrify/nostrify';
import { type FC, type ReactNode, useEffect, useReducer, useRef } from 'react';

import { IdbRelay } from './IdbRelay.ts';
import { NostrContext, type NostrContextType } from './NostrContext.ts';
import { nostrLoginReducer } from './nostrLoginReducer.ts';

interface NostrProviderProps {
  storageKey?: string;
  children: ReactNode;
  relays: Array<`wss://${string}` | `ws://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = ({ children, relays: relayUrls, storageKey = 'nostr' }) => {
  const [logins, dispatch] = useReducer(nostrLoginReducer, undefined, () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  const pool = useRef<NPool<NRelay1>>(undefined);
  const local = useRef<IdbRelay>(undefined);

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

  if (!local.current) {
    local.current = new IdbRelay(storageKey);
  }

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(logins));
  }, [logins]);

  const context: NostrContextType = {
    nostr: pool.current,
    logins,
    dispatch,
    windowSigner: (globalThis as unknown as { nostr?: NostrSigner }).nostr,
    local: local.current,
    pool: pool.current,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
