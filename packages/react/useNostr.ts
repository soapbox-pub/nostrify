import { NConnectSigner, type NostrSigner, type NRelay, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useNostrContext } from './useNostrContext.ts';
import { type UseNostrLogin, useNostrLogin } from './useNostrLogin.ts';

import type { NLogin } from './NState.ts';
import { NostrContextType } from './NostrContext.ts';

interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: NLogin['type'];
}

interface UseNostr {
  user: NUser | undefined;
  users: NUser[];
  login: UseNostrLogin;
  pool: NRelay;
  windowSigner?: NostrSigner;
}

export function useNostr(): UseNostr {
  const login = useNostrLogin();
  const context = useNostrContext();

  const { pool, state, dispatch } = context;
  const { logins } = state;

  const users: NUser[] = [];

  logins.forEach((login, index) => {
    try {
      const user = loginToUser(login, context);
      users.push(user);
    } catch {
      console.error('Failed to create user from login', login);
      dispatch({ type: 'login.remove', index });
    }
  });

  return {
    user: users[0],
    users,
    login,
    pool,
  };
}

function loginToUser(login: NLogin, context: NostrContextType): NUser {
  const { pool, windowSigner } = context;

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
          relay: pool,
          timeout: 60_000,
        }),
      };
    }
    case 'extension': {
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
