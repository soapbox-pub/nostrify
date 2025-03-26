import { type Context, createContext } from 'react';

import type { NostrSigner, NPool } from '@nostrify/nostrify';

export interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: 'nsec' | 'bunker' | 'extension';
}

export interface NostrLogin {
  nsec(nsec: string): void;
  bunker(uri: string): Promise<void>;
  extension(): Promise<void>;
  logout(id: number): void;
  clear(): void;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface NostrContextType {
  nostr: NPool;
  user: NUser | undefined;
  logins: NUser[];
  login: NostrLogin;
}

export const NostrContext: Context<NostrContextType | undefined> = createContext<NostrContextType | undefined>(
  undefined,
);
