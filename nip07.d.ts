import { NostrSigner } from './interfaces/NostrSigner.ts';

declare global {
  interface Window {
    nostr?: NostrSigner;
  }
}
