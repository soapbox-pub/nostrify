import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import { useNostr } from '../useNostr.ts';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  function loginToUser(login: NLoginType): NUser {
    switch (login.type) {
      case 'nsec':
        return NUser.fromNsecLogin(login);
      case 'bunker':
        return NUser.fromBunkerLogin(login, nostr);
      case 'extension':
        return NUser.fromExtensionLogin(login);
      default:
        // Learn how to define other login types: https://nostrify.dev/react/logins#custom-login-types
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }

  const users = useMemo(() => {
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

  const user: NUser | undefined = users[0];
  const metadata = useAuthor(user?.pubkey);

  return {
    user,
    users,
    metadata,
  };
}
