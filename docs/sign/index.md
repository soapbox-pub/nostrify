# Signers

Signers are used for signing events. But they are also used to encrypt & decrypt messages, get a public key from a private key, and even to get a list of relays for the user.

In fact, Nostrify signers all implement the [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) interface.

That means signers from Nostrify are all drop-in replacements for `window.nostr`! And `window.nostr` is itself a valid Nostrify signer.

## Implementations

- [Private Key](/sign/nsec)
- [HD Seed](/sign/seed)
- [Nostr Connect](/sign/connect)
- [Custodial](/sign/custodial)

## Custom Signers

To build your own signer, just implement the [`NostrSigner`](https://jsr.io/@nostrify/nostrify/doc/~/NostrSigner) interface.

```ts
import { NostrEvent, NostrSigner } from '@nostrify/nostrify';

export class MySigner implements NostrSigner {
  constructor(/* your options */) {
    // Use the constructor to add any additional information you need.
  }

  async getPublicKey(): Promise<string> {
    // Get the public key for the user.
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    // Sign the event.
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      // Encrypt the message with NIP-04.
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      // Decrypt the message with NIP-04.
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      // Encrypt the message with NIP-44.
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      // Decrypt the message with NIP-44.
    },
  };
}

```