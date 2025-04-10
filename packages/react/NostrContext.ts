import { type Context, createContext } from 'react';

import type { NostrSigner, NPool } from '@nostrify/nostrify';

/**
 * Represents a Nostr user with authentication credentials.
 */
export interface NUser {
  /** The public key of the user in hex format */
  pubkey: string;
  /** The signer that can sign events on behalf of this user */
  signer: NostrSigner;
  /** The authentication method used for this user */
  method: 'nsec' | 'bunker' | 'extension';
}

/**
 * Authentication interface for Nostr login/logout operations.
 */
export interface NostrLoginActions {
  /**
   * Log in with a private key in bech32 nsec format.
   * @param nsec The private key in bech32 nsec format (e.g., nsec1...)
   */
  nsec(nsec: string): void;

  /**
   * Log in with a Nostr Bunker URI.
   * Format: nostr+bunker://<pubkey>?relay=<relay_url>&secret=<secret>
   * @param uri The Bunker URI to connect with
   */
  bunker(uri: string): Promise<void>;

  /**
   * Log in with a NIP-07 browser extension (e.g., Alby, nos2x).
   * Requires window.nostr to be available.
   */
  extension(): Promise<void>;

  /**
   * Log out a specific user by ID.
   * @param id The ID of the user to log out in format 'method:pubkey'
   */
  logout(id: string): void;

  /**
   * Log out all users.
   */
  clear(): void;
}

/**
 * The shape of the Nostr context provided by NostrProvider.
 */
export interface NostrContextType {
  /** Name of the application used for storage keys and NIP-89 "client" tags. */
  appName: string;

  /** The Nostr relay pool for querying and publishing events */
  nostr: NPool;

  /** The currently active user, or undefined if not logged in */
  user: NUser | undefined;

  /** All authenticated users */
  logins: NUser[];

  /** Authentication methods and state */
  login: NostrLoginActions;
}

/**
 * React context for Nostr functionality.
 * Use this with useContext or the useNostr hook to access Nostr features.
 */
export const NostrContext: Context<NostrContextType | undefined> = createContext<NostrContextType | undefined>(
  undefined,
);
