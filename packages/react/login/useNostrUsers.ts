import { useMemo } from 'react';

import { useNostrLogin } from './useNostrLogin.ts';
import { loginToUser } from './utils/loginToUser.ts';

import type { NPool } from '@nostrify/nostrify';
import type { NUser } from '../NostrContext.ts';

export function useNostrUsers(pool: NPool): NUser[] {
  const [logins] = useNostrLogin();

  return useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login, pool);
        users.push(user);
      } catch (error) {
        console.warn('Invalid login skipped', login.id, error);
      }
    }

    return users;
  }, [logins, pool]);
}
