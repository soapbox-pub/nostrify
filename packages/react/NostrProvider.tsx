import { NConnectSigner, NostrEvent, NostrSigner, NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { type FC, type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { nostrLoginReducer } from './login/nostrLoginReducer.ts';
import { loginToUser } from './login/utils/loginToUser.ts';
import { parseBunkerUri } from './login/utils/parseBunkerUri.ts';
import { NostrContext, type NostrContextType, type NostrLogin, NUser } from './NostrContext.ts';

interface NostrProviderProps {
  appName: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = (props) => {
  const { children, relays: relayUrls, appName } = props;

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

  const { logins, ...login } = useNostrLogin(pool.current, appName);

  user.current = logins[0];

  const context: NostrContextType = {
    appName,
    nostr: pool.current,
    user: user.current,
    login,
    logins,
  };

  return (
    <NostrContext.Provider value={context}>
      {children}
    </NostrContext.Provider>
  );
};

function useNostrLogin(pool: NPool, storageKey: string): NostrLogin & { logins: NUser[] } {
  const [state, dispatch] = useReducer(nostrLoginReducer, [], () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const logins = useMemo(() => {
    const users: NUser[] = [];

    for (const login of state) {
      try {
        const user = loginToUser(login, pool);
        users.push(user);
      } catch {
        console.error('Invalid login', login);
      }
    }

    return users;
  }, [state, pool]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  return {
    logins,
    nsec(nsec: string): void {
      try {
        const decoded = nip19.decode(nsec);

        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }

        const sk = decoded.data;
        const pubkey = getPublicKey(sk);

        dispatch({
          type: 'login.add',
          login: {
            id: `nsec:${pubkey}`,
            type: 'nsec',
            nsec: nip19.nsecEncode(sk),
            pubkey,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    async bunker(uri: string): Promise<void> {
      try {
        const { pubkey: bunkerPubkey, secret, relays } = parseBunkerUri(uri);

        if (!relays.length) {
          throw new Error('No relay provided');
        }

        const sk = generateSecretKey();
        const nsec = nip19.nsecEncode(sk);
        const clientSigner = new NSecSigner(sk);

        const signer = new NConnectSigner({
          relay: pool.group(relays),
          pubkey: bunkerPubkey,
          signer: clientSigner,
          timeout: 20_000,
        });

        await signer.connect(secret);
        const pubkey = await signer.getPublicKey();

        dispatch({
          type: 'login.add',
          login: {
            id: `bunker:${pubkey}`,
            type: 'bunker',
            pubkey,
            createdAt: new Date().toISOString(),
            bunkerPubkey,
            clientNsec: nsec,
            relays,
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    async extension(): Promise<void> {
      try {
        const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

        if (!windowSigner) {
          throw new Error('Nostr extension is not available');
        }

        const pubkey = await windowSigner.getPublicKey();

        dispatch({
          type: 'login.add',
          login: {
            id: `extension:${pubkey}`,
            type: 'extension',
            pubkey,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    logout(id: string): void {
      dispatch({ type: 'login.remove', id });
    },
    clear(): void {
      dispatch({ type: 'login.clear' });
    },
    isLoading,
    isError,
    error,
  };
}
