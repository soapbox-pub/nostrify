import { BunkerURI, NConnectSigner, type NostrSigner, NPool, NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

import type { NLoginAction } from './nostrLoginReducer.ts';

export class NostrLoginActions {
  constructor(
    private pool: NPool,
    private dispatch: (action: NLoginAction) => void,
  ) {}

  nsec(nsec: string): void {
    const decoded = nip19.decode(nsec);

    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec');
    }

    const sk = decoded.data;
    const pubkey = getPublicKey(sk);

    this.dispatch({
      type: 'login.add',
      login: {
        id: `nsec:${pubkey}`,
        type: 'nsec',
        nsec: nip19.nsecEncode(sk),
        pubkey,
        createdAt: new Date().toISOString(),
      },
    });
  }

  async bunker(uri: string): Promise<void> {
    const { pubkey: bunkerPubkey, secret, relays } = new BunkerURI(uri);

    if (!relays.length) {
      throw new Error('No relay provided');
    }

    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const clientSigner = new NSecSigner(sk);

    const signer = new NConnectSigner({
      relay: this.pool.group(relays),
      pubkey: bunkerPubkey,
      signer: clientSigner,
      timeout: 60_000,
    });

    await signer.connect(secret);
    const pubkey = await signer.getPublicKey();

    this.dispatch({
      type: 'login.add',
      login: {
        id: `bunker:${pubkey}`,
        type: 'bunker',
        pubkey,
        createdAt: new Date().toISOString(),
        bunkerPubkey,
        clientNsec: nsec,
        relays,
      },
    });
  }

  async extension(): Promise<void> {
    const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

    if (!windowSigner) {
      throw new Error('Nostr extension is not available');
    }

    const pubkey = await windowSigner.getPublicKey();

    this.dispatch({
      type: 'login.add',
      login: {
        id: `extension:${pubkey}`,
        type: 'extension',
        pubkey,
        createdAt: new Date().toISOString(),
      },
    });
  }

  logout(id: string): void {
    this.dispatch({ type: 'login.remove', id });
  }

  clear(): void {
    this.dispatch({ type: 'login.clear' });
  }
}
