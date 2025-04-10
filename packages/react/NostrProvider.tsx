import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { type FC, type ReactNode, useRef } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';

interface NostrProviderProps {
  appName: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = (props) => {
  const { appName, children, relays } = props;

  const pool = useRef<NPool>(undefined);

  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        return new Map(relays.map((url) => [url, filters]));
      },
      eventRouter(_event: NostrEvent) {
        return relays;
      },
    });
  }

  const context: NostrContextType = {
    appName,
    nostr: pool.current,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
