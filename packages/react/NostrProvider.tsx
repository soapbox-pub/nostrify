import {
  NConnectSigner,
  NostrEvent,
  type NostrFilter,
  NostrSigner,
  NPool,
  type NRelay,
  NRelay1,
  NSecSigner,
} from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { type FC, type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { NLogin } from './NLogin.ts';
import { NostrContext, type NostrContextType, type NostrLogin, NUser } from './NostrContext.ts';
import { nostrLoginReducer } from './nostrLoginReducer.ts';

interface NostrProviderProps {
  storageKey?: string;
  children: ReactNode;
  relays: Array<`wss://${string}`>;
  outbox?: boolean;
}

export const NostrProvider: FC<NostrProviderProps> = (
  { children, relays: relayUrls, storageKey = 'nostr', outbox = false },
) => {
  const pool = useRef<NPool>(undefined);
  const user = useRef<NUser | undefined>(undefined);

  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      async reqRouter(filters) {
        if (outbox && user.current && pool.current) {
          const pubkey = user.current.pubkey;

          const routes = new Map<string, NostrFilter[]>();
          const authors = new Set<string>([pubkey]);

          for (const filter of filters) {
            for (const author of filter.authors ?? []) {
              authors.add(author);
            }
          }

          const map = new Map<string, NostrEvent>();
          const signal = AbortSignal.timeout(5000);

          const userRelays = await fetchUserRelayUrls({
            relay: pool.current.group([...relayUrls]),
            pubkey,
            marker: 'read',
            signal,
          });

          for (const url of relayUrls) {
            userRelays.add(url);
          }

          const relay = pool.current.group([...userRelays]);

          for (const event of await relay.query([{ kinds: [10002], authors: [...authors] }], { signal })) {
            map.set(event.pubkey, event);
          }

          for (const filter of filters) {
            if (filter.authors) {
              const relayAuthors = new Map<`wss://${string}`, Set<string>>();

              for (const author of filter.authors) {
                const event = map.get(author) ?? map.get(pubkey);
                if (event) {
                  for (const relayUrl of [...extractRelayUrls(event, 'write')]) {
                    const value = relayAuthors.get(relayUrl);
                    relayAuthors.set(relayUrl, value ? new Set([...value, author]) : new Set([author]));
                  }
                }
              }

              for (const [relayUrl, authors] of relayAuthors) {
                const value = routes.get(relayUrl);
                const _filter = { ...filter, authors: [...authors] };
                routes.set(relayUrl, value ? [...value, _filter] : [_filter]);
              }
            } else {
              const event = map.get(pubkey);
              if (event) {
                for (const relayUrl of [...extractRelayUrls(event, 'read')]) {
                  const value = routes.get(relayUrl);
                  routes.set(relayUrl, value ? [...value, filter] : [filter]);
                }
              }
            }
          }

          for (const url of relayUrls) {
            if (!routes.has(url)) {
              routes.set(url, filters);
            }
          }

          return routes;
        } else {
          return new Map(relayUrls.map((url) => [url, filters]));
        }
      },
      async eventRouter(_event: NostrEvent) {
        if (outbox && user.current && pool.current) {
          const relays = await fetchUserRelayUrls({
            relay: pool.current.group([...relayUrls]),
            pubkey: user.current.pubkey,
            marker: 'write',
            signal: AbortSignal.timeout(500),
          });

          for (const url of relayUrls) {
            relays.add(url);
          }

          return [...relays];
        } else {
          return relayUrls;
        }
      },
    });
  }

  const { logins, ...login } = useNostrLogin(pool.current, storageKey);

  user.current = logins[0];

  const context: NostrContextType = {
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

async function fetchUserRelayUrls(
  opts: { relay: NRelay; pubkey: string; marker?: 'read' | 'write'; signal?: AbortSignal },
): Promise<Set<`wss://${string}`>> {
  const { relay, pubkey, marker, signal } = opts;

  const relayUrls = new Set<`wss://${string}`>();

  const events = await relay.query(
    [{ kinds: [10002], authors: [pubkey], limit: 1 }],
    { signal },
  );

  for (const event of events) {
    for (const relayUrl of extractRelayUrls(event, marker)) {
      relayUrls.add(relayUrl);
    }
  }

  return relayUrls;
}

function extractRelayUrls(event: NostrEvent, marker?: 'read' | 'write'): Set<`wss://${string}`> {
  const relayUrls = new Set<`wss://${string}`>();

  for (const [name, relayUrl, tagMarker] of event.tags) {
    if (name === 'r' && (!marker || !tagMarker || marker === tagMarker)) {
      try {
        const url = new URL(relayUrl);
        if (url.protocol === 'wss:') {
          relayUrls.add(url.toString() as `wss://${string}`);
        }
      } catch {
        // fallthrough
      }
    }
  }

  return relayUrls;
}
