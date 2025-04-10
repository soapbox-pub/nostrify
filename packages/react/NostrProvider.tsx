import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { type FC, type ReactNode, useMemo, useRef } from 'react';

import { NostrContext, type NostrContextType, NUser } from './NostrContext.ts';
import { NostrLoginActions } from './login/NostrLoginActions.ts';
import { useNostrLoginState } from './login/useNostrLoginState.ts';
import { loginToUser } from './login/utils/loginToUser.ts';

interface NostrProviderProps {
  appName: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = (props) => {
  const { children, relays: relayUrls, appName } = props;
  const { state, dispatch } = useNostrLoginState();

  const pool = useRef<NPool>(undefined);
  const user = useRef<NUser | undefined>(undefined);

  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        return new Map(relayUrls.map((url) => [url, filters]));
      },
      eventRouter(_event: NostrEvent) {
        return relayUrls;
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

  user.current = logins[0];

  const context: NostrContextType = {
    appName,
    nostr: pool.current,
    user: user.current,
    login: new NostrLoginActions(pool.current, dispatch),
    logins,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};
