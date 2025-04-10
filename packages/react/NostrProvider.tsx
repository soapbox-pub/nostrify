import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { type FC, type ReactNode, useMemo, useRef } from 'react';

import { NostrContext, type NostrContextType, NUser } from './NostrContext.ts';
import { NostrLoginActions } from './login/NostrLoginActions.ts';
import { loginToUser } from './login/utils/loginToUser.ts';
import { useNostrLoginContext } from './login/useNostrLoginContext.ts';

interface NostrProviderProps {
  appName: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = (props) => {
  const { appName, children, relays } = props;
  const { state, dispatch } = useNostrLoginContext();

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

  const logins = useMemo(() => {
    const users: NUser[] = [];

    if (!pool.current) {
      return [];
    }

    for (const login of state) {
      try {
        const user = loginToUser(login, pool.current);
        users.push(user);
      } catch {
        console.error('Invalid login', login);
      }
    }

    return users;
  }, [state, pool]);

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
