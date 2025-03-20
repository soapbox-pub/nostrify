import { NConnectSigner, type NostrSigner, type NRelay, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useNostrContext } from './useNostrContext.ts';

import type { NLogin } from './NState.ts';

interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: NLogin['type'];
}

interface UseNostr {
  user: NUser | undefined;
  users: NUser[];
  pool: NRelay;
}

export function useNostr(): UseNostr {
  const { pool, state, dispatch } = useNostrContext();
  const { logins } = state;

  const users: NUser[] = [];

  logins.forEach((login, index) => {
    try {
      const user = loginToUser(login, pool);
      users.push(user);
    } catch {
      console.error('Failed to create user from login', login);
      dispatch({ type: 'login.remove', index });
    }
  });

  return {
    user: users[0],
    users,
    pool,
  };
}

function loginToUser(login: NLogin, relay: NRelay): NUser {
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
          relay,
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
