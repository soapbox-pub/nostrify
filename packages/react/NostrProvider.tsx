import { NPool, NRelay1 } from '@nostrify/nostrify';

import { NostrContext, type NostrContextType } from './NostrContext.ts';

interface NostrProviderProps {
  children: React.ReactNode;
  relay: `wss://${string}` | `ws://${string}`;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ children, relay: relayUrl }) => {
  const pool = new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: () => {
      // TODO
      return Promise.resolve(new Map());
    },
    eventRouter: () => {
      // TODO
      return Promise.resolve([]);
    },
  });

  const context: NostrContextType = {
    pool,
    relay: pool.relay(relayUrl),
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
