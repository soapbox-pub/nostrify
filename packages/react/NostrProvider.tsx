import { NPool, NRelay1 } from '@nostrify/nostrify';

import { NostrContext, type NostrContextType } from './NostrContext.ts';

interface NostrProviderProps {
  children: React.ReactNode;
  relays: Array<`wss://${string}` | `ws://${string}`>;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ children, relays: relayUrls }) => {
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
    pool,
    state: {
      logins: [],
    },
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
