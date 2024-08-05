import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/** Policy options for `SizePolicy`. */
interface SizePolicyOpts {
  /** Maximum size of the message content in bytes. Default: 8192 (8KB) */
  maxBytes?: number;
}

/**
 * Reject events larger than a specified size in bytes.
 *
 * ```ts
 * // Reject events larger than the default size (8KB) .
 * new SizePolicy();
 * // Reject events larger than a custom size (15KB).
 * new SizePolicy({ maxBytes: 15 * 1024 });
 * ```
 */
export class SizePolicy implements NPolicy {
  constructor(private opts: SizePolicyOpts = {}) {}

  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const { maxBytes = 8 * 1024 } = this.opts;

    const json = JSON.stringify(event);
    const size = new TextEncoder().encode(json).length;

    if (size > maxBytes) {
      return ['OK', event.id, false, `blocked: event is too large`];
    }

    return ['OK', event.id, true, ''];
  }
}
