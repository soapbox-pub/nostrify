import { NostrSigner, NPool, NRelay1 } from '@nostrify/nostrify';
import { useReducer } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';
import { nostrReducer } from './nostrReducer.ts';

interface NostrProviderProps {
  children: React.ReactNode;
  relays: Array<`wss://${string}` | `ws://${string}`>;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ children, relays: relayUrls }) => {
  const [state, dispatch] = useReducer(nostrReducer, { logins: [] });

  const pool = new NPool({
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

  const context: NostrContextType = {
    nostr: pool,
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
