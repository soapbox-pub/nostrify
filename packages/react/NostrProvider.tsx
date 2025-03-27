import { NConnectSigner, NostrSigner, NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { type FC, type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { IdbRelay } from './IdbRelay.ts';
import { NLogin } from './NLogin.ts';
import { NostrContext, type NostrContextType, type NostrLogin, NUser } from './NostrContext.ts';
import { nostrLoginReducer } from './nostrLoginReducer.ts';

interface NostrProviderProps {
  storageKey?: string;
  children: ReactNode;
  relays: Array<`wss://${string}` | `ws://${string}`>;
}

export const NostrProvider: FC<NostrProviderProps> = ({ children, relays: relayUrls, storageKey = 'nostr' }) => {
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

  const { logins, ...login } = useNostrLogin(pool.current, storageKey);

  const context: NostrContextType = {
    nostr: pool.current,
    user: logins[0],
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
  const [state, dispatch] = useReducer(nostrLoginReducer, undefined, () => {
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

        const relay = pool.relay(relays[0]); // TODO: handle multiple relays

        const sk = generateSecretKey();
        const nsec = nip19.nsecEncode(sk);
        const clientSigner = new NSecSigner(sk);

        const signer = new NConnectSigner({
          relay,
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

function loginToUser(login: NLogin, pool: NPool): NUser {
  switch (login.type) {
    case 'nsec': {
      const sk = nip19.decode(login.nsec);
      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: new NSecSigner(sk.data),
      };
    }
    case 'bunker': {
      const clientSk = nip19.decode(login.clientNsec);
      const clientSigner = new NSecSigner(clientSk.data);

      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: new NConnectSigner({
          pubkey: login.pubkey,
          signer: clientSigner,
          relay: pool.relay(login.relays[0]),
          timeout: 60_000,
        }),
      };
    }
    case 'extension': {
      const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

      if (!windowSigner) {
        throw new Error('Nostr extension is not available');
      }

      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: windowSigner,
      };
    }
  }
}

function parseBunkerUri(uri: string): { pubkey: string; secret?: string; relays: string[] } {
  const url = new URL(uri);
  const params = new URLSearchParams(url.search);

  // https://github.com/denoland/deno/issues/26440
  const pubkey = url.hostname || url.pathname.slice(2);
  const secret = params.get('secret') ?? undefined;
  const relays = params.getAll('relay');

  if (!pubkey) {
    throw new Error('Invalid bunker URI');
  }

  return { pubkey, secret, relays };
}
