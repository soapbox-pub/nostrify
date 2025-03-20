import { useContext } from 'react';

import { NostrContext } from './NostrContext.ts';

import type { NostrSigner } from '@nostrify/nostrify';
import type { NLogin } from './NState.ts';

interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: NLogin['type'];
}

interface UseNostr {
  user: NUser | undefined;
}

export function useNostr(): UseNostr {
  const context = useContext(NostrContext);

  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }

  return context;
}
