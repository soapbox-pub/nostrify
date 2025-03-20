import { getPublicKey, nip19 } from 'nostr-tools';

import { useNostrContext } from './useNostrContext.ts';

import type { NostrSigner } from '@nostrify/nostrify';

export interface UseNostrLogin {
  nsec(nsec: string): void;
  bunker(uri: string): Promise<void>;
  extension(): Promise<void>;
}

export function useNostrLogin(): UseNostrLogin {
  const { dispatch } = useNostrContext();

  return {
    nsec(nsec: string): void {
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
    },
    async bunker(_uri: string): Promise<void> {
      // TODO: bunker login
    },
    async extension(): Promise<void> {
      const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

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
    },
  };
}
