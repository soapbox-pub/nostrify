import { useMemo } from 'react';

import { NUser } from './NUser.ts';
import { useNostrLogin } from './useNostrLogin.ts';
import { useNostr } from '../useNostr.ts';

import type { NLogin } from './NLogin.ts';

export function useNostrUsers(): NUser[] {
  const { nostr } = useNostr();
  const [logins] = useNostrLogin();

  function loginToUser(login: NLogin): NUser {
    switch (login.type) {
      case 'nsec':
        return NUser.fromNsecLogin(login);
      case 'bunker':
        return NUser.fromBunkerLogin(login, nostr);
      case 'extension':
        return NUser.fromExtensionLogin(login);
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }

  return useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn('Skipped invalid login', login.id, error);
      }
    }

    return users;
  }, [logins, nostr]);
}
