import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { type FC, type ReactNode, useRef } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';
import { NostrLoginActions } from './login/NostrLoginActions.ts';
import { useNostrLogin } from './login/useNostrLogin.ts';
import { useNostrUsers } from './login/useNostrUsers.ts';

interface NostrProviderProps {
  appName: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = (props) => {
  const { appName, children, relays } = props;

  const [_state, dispatch] = useNostrLogin();
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

  const logins = useNostrUsers();

  const context: NostrContextType = {
    appName,
    nostr: pool.current,
    user: logins[0],
    login: new NostrLoginActions(pool.current, dispatch),
    logins,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
