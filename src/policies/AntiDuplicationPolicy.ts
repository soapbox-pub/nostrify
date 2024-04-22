import { NostrEvent } from '../../interfaces/NostrEvent.ts';
import { NostrRelayOK } from '../../interfaces/NostrRelayMsg.ts';
import { NPolicy } from '../../interfaces/NPolicy.ts';

/** Policy options for `AntiDuplicationPolicy`. */
interface AntiDuplicationPolicyOpts {
  /** Deno.Kv implementation to use. */
  kv: Pick<Deno.Kv, 'get' | 'set'>;
  /** Time in ms until a message with this content may be posted again. Default: `60000` (1 minute). */
  expireIn?: number;
  /** Note text under this limit will be skipped by the policy. Default: `50`. */
  minLength?: number;
}

/**
 * Prevent messages with the exact same content from being submitted repeatedly.
 *
 * It stores a hashcode for each content in an SQLite database and rate-limits them. Only messages that meet the minimum length criteria are selected.
 * Each time a matching message is submitted, the timer will reset, so spammers sending the same message will only ever get the first one through.
 *
 * @example
 * ```ts
 * // Prevent the same message from being posted within 60 seconds.
 * new AntiDuplicationPolicy({ expireIn: 60000 });
 *
 * // Only enforce the policy on messages with at least 50 characters.
 * new AntiDuplicationPolicy({ expireIn: 60000, minLength: 50 });
 *
 * // Use a custom Deno.Kv instance.
 * new AntiDuplicationPolicy({ kv: await Deno.openKv('./mydb.sqlite3') });
 * ```
 */
export class AntiDuplicationPolicy implements NPolicy {
  private opts: AntiDuplicationPolicyOpts;

  constructor(opts: AntiDuplicationPolicyOpts) {
    this.opts = opts;
  }

  async call({ id, kind, content }: NostrEvent): Promise<NostrRelayOK> {
    const { kv, expireIn = 60000, minLength = 50 } = this.opts;

    if (kind === 1 && content.length >= minLength) {
      const hash = String(AntiDuplicationPolicy.hashCode(content));
      const key: Deno.KvKey = ['nostrify', 'policies', 'antiduplication', hash];

      const { value } = await kv.get(key);

      if (value) {
        await kv.set(key, true, { expireIn });
        return ['OK', id, false, ''];
      }

      await kv.set(key, true, { expireIn });
    }

    return ['OK', id, true, ''];
  }

  /**
   * Get a "good enough" unique identifier for this content.
   * This algorithm was chosen because it's very fast with a low chance of collisions.
   * https://stackoverflow.com/a/8831937
   */
  private static hashCode(str: string): number {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
}
