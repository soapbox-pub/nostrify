import { getPublicKey, nip19 } from 'nostr-tools';
import { useState } from 'react';

import { useNostrContext } from './useNostrContext.ts';

export interface UseNostrLogin {
  nsec(nsec: string): void;
  bunker(uri: string): Promise<void>;
  extension(): Promise<void>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useNostrLogin(): UseNostrLogin {
  const { dispatch, windowSigner } = useNostrContext();

  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  return {
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
    async bunker(_uri: string): Promise<void> {
      // TODO: bunker login
    },
    async extension(): Promise<void> {
      try {
        if (!windowSigner) {
          throw new Error('Nostr extension is not available');
        }

        dispatch({
          type: 'login.add',
          login: {
            type: 'extension',
            pubkey: await windowSigner.getPublicKey(),
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
    isLoading,
    isError,
    error,
  };
}
