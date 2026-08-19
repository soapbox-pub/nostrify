import type { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';
import type { Kv, KvKey } from '@deno/kv';

/** Policy options for `AntiDuplicationPolicy`. */
interface AntiDuplicationPolicyOpts {
  /** Deno.Kv implementation to use. */
  kv: Pick<Kv, 'get' | 'set'>;
  /** Time in ms until a message with this content may be posted again. Default: `60000` (1 minute). */
  expireIn?: number;
  /** Note text under this limit will be skipped by the policy. Default: `50`. */
  minLength?: number;
  /** Normalize the event's content before a hash is taken, to prevent the attacker from making small changes. Should return the normalized content. */
  deobfuscate?(event: NostrEvent): string;
}

/**
 * Prevent messages with the exact same content from being submitted repeatedly.
 *
 * It stores a hashcode for each content in a Deno.Kv database and rate-limits them. Only messages that meet the minimum length criteria are selected.
 * Each time a matching message is submitted, the timer will reset, so spammers sending the same message will only ever get the first one through.
 *
 * ```ts
 * // Open a Deno.KV instance.
 * const kv = await Deno.openKv();
 *
 * // Prevent the same message from being posted within 60 seconds.
 * new AntiDuplicationPolicy({ kv, expireIn: 60000 });
 *
 * // Only enforce the policy on messages with at least 50 characters.
 * new AntiDuplicationPolicy({ kv, expireIn: 60000, minLength: 50 });
 * ```
 */
export class AntiDuplicationPolicy implements NPolicy {
  private opts: AntiDuplicationPolicyOpts;

  constructor(opts: AntiDuplicationPolicyOpts) {
    this.opts = opts;
  }

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const { id, kind } = event;
    const { kv, expireIn = 60000, minLength = 50, deobfuscate } = this.opts;

    const content = deobfuscate?.(event) ?? event.content;

    if (kind === 1 && content.length >= minLength) {
      const hash = await AntiDuplicationPolicy.hash(content);
      const key: KvKey = ['nostrify', 'policies', 'antiduplication', hash];

      const { value } = await kv.get(key);

      if (value) {
        await kv.set(key, true, { expireIn });
        return [
          'OK',
          id,
          false,
          'blocked: the same message has been repeated too many times',
        ];
      }

      await kv.set(key, true, { expireIn });
    }

    return ['OK', id, true, ''];
  }

  /**
   * A collision-resistant identifier for this content.
   *
   * The key here is derived from a string an attacker writes, and a collision
   * means blocking somebody else's post — so the hash has to be one that can't
   * be aimed. The previous 32-bit `hashCode` could be: with a 4-byte digest,
   * a preimage for any target is minutes of brute force, and a spammer who
   * seeds the store with content colliding against a message they want
   * suppressed gets it rejected for the whole `expireIn` window.
   */
  private static async hash(str: string): Promise<string> {
    const data = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
