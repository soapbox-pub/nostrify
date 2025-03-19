import { createContext } from 'react';

import type { NostrSigner, NRelay } from '@nostrify/nostrify';
import type { NLogin } from './NLogin.ts';

interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: NLogin['type'];
}

export interface NostrContextType {
  pool: NRelay;
  user: NUser | undefined;
  logins: NLogin[];
}

export const NostrContext = createContext<NostrContextType | undefined>(undefined);
