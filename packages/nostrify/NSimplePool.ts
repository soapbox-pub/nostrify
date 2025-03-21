import { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/types';
import { Nostr, verifyEvent } from 'nostr-tools';
import { AbstractSimplePool } from 'nostr-tools/pool';

import { Machina } from './utils/Machina.ts';

export interface NSimplePoolOpts {
  verifyEvent?: Nostr['verifyEvent'];
  trackRelays?: boolean;
  trustedRelayURLs?: Set<string>;
}

/**
 * NRelay implementation built on top of SimplePool from nostr-tools.
 */
export class NSimplePool implements NRelay {
  pool: AbstractSimplePool;

  constructor(opts?: NSimplePoolOpts) {
    this.pool = new AbstractSimplePool({
      verifyEvent: opts?.verifyEvent ?? verifyEvent,
    });
    this.pool.trackRelays = opts?.trackRelays ?? false;
    this.pool.trustedRelayURLs = opts?.trustedRelayURLs ?? new Set();
  }

  get seenOn(): Map<string, Set<string>> {
    const seenOn = new Map<string, Set<string>>();

    for (const [id, relays] of this.pool.seenOn) {
      seenOn.set(id, new Set([...relays].map((relay) => relay.url)));
    }

    return seenOn;
  }

  async *req(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; relays?: string[] } = {},
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    if (opts.signal?.aborted) throw new DOMException('The signal has been aborted', 'AbortError');

    const subId = crypto.randomUUID();
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(opts.signal);

    const sub = this.pool.subscribeMany(opts.relays ?? [], filters, {
      id: subId,
      onevent(event) {
        machina.push(['EVENT', subId, event]);
      },
      oneose() {
        machina.push(['EOSE', subId]);
      },
      onclose(reasons) {
        machina.push(['CLOSED', subId, reasons.join(', ')]);
      },
    });

    const abort = () => {
      sub.close();
      cleanup();
    };

    const cleanup = () => {
      opts.signal?.removeEventListener('abort', abort);
    };

    opts.signal?.addEventListener('abort', abort);

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      abort();
    }
  }

  // deno-lint-ignore require-await
  async event(event: NostrEvent, opts: { signal?: AbortSignal; relays?: string[] } = {}): Promise<void> {
    if (opts.signal?.aborted) {
      throw new DOMException('The signal has been aborted', 'AbortError');
    }
    this.pool.publish(opts.relays ?? [], event);
  }

  async query(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; relays?: string[] } = {},
  ): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    for await (const msg of this.req(filters, opts)) {
      if (msg[0] === 'EOSE') break;
      if (msg[0] === 'EVENT') events.push(msg[2]);
      if (msg[0] === 'CLOSED') throw new Error('Subscription closed');
    }

    return events;
  }

  /** Disconnect from the given relay URLs. */
  disconnect(relays: string[]): void {
    this.pool.close(relays);
  }

  // deno-lint-ignore require-await
  async close(): Promise<void> {
    this.pool.destroy();
  }
}
