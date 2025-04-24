# Lightning Zaps

Nostrify provides an [LNURL class](https://jsr.io/@nostrify/nostrify/doc/ln/~/LNURL) for implementing [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) zaps.

## The `LNURL` class

The `LNURL` class can be created from a `lud06` or `lud16` entry in a user's kind 0 metadata, then used to generate an invoice.

```typescript
import { LNURL } from '@nostrify/nostrify/ln';

const lnurl = LNURL.fromString(lud06); // eg "lnurl1..."
const lnurl = LNURL.fromLightningAddress(lud16); // eg "example@getalby.com"
```

Once an LNURL object is created, it can be used to generate an invoice.

```typescript
const { pr } = await lnurl.getInvoice({
  amount: 1000,
  nostr: zapRequest, // { kind: 9734, ... }
});
```

Finally, the user will need to pay the invoice. For example, using [WebLN](https://www.webln.dev/):

```typescript
await window.webln.enable();
await window.webln.sendPayment(pr);
```

## Full Example

This function implements a full zap request flow with Nostrify.

```typescript
import { NostrEvent, NostrSigner, NRelay, NSchema as n } from '@nostrify/nostrify';
import { LNURL } from '@nostrify/nostrify/ln';

/**
 * Initiate a zap for a particular event.
 * Returns a Lightning invoice that must be paid by the user to complete the zap.
 */
async function zapRequest(opts: {
  /** Nostrify relay or pool implementation. */
  nostr: NRelay;
  /** Logged-in user's signer object. */
  signer: NostrSigner;
  /** Event to be zapped. */
  target: NostrEvent;
  /** Amount to zap in millisatoshis. */
  amount: number;
  /** List of relays the zap recipt should be sent to. At least 1 must be provided. */
  relays: [string, ...string[]];
  /** Optional signal to abort the zap request. */
  signal?: AbortSignal;
}): Promise<`lnbc1${string}`> {
  const { nostr, signer, target, amount, relays, signal } = opts;

  // Fetch the author's kind 0 event
  const [author] = await nostr.query(
    [{ kinds: [0], authors: [target.pubkey], limit: 1 }],
    { signal },
  );
  if (!author) {
    throw new Error('Author not found');
  }

  // Parse author metadata
  const { lud06, lud16 } = n.json().pipe(n.metadata()).parse(author.content);

  // Get author's LNURL
  let lnurl: LNURL | undefined;
  if (lud16) {
    lnurl = LNURL.fromLightningAddress(lud16);
  } else if (lud06) {
    lnurl = LNURL.fromString(lud06);
  }
  if (!lnurl) {
    throw new Error('No LNURL found');
  }

  // Create zap request
  const zapRequest = await signer.signEvent({
    kind: 9734,
    content: '',
    tags: [
      ['e', target.id],
      ['p', target.pubkey],
      ['amount', amount.toString()],
      ['relays', ...relays],
      ['lnurl', lnurl.toString()],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  // Return invoice
  const { pr } = await lnurl.getInvoice({ amount, nostr: zapRequest, signal });
  return pr;
}
```
