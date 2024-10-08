import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/** Policy options for `AntiDuplicationPolicy`. */
interface AntiDuplicationPolicyOpts {
  /** Deno.Kv implementation to use. */
  kv: Pick<Deno.Kv, 'get' | 'set'>;
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
  constructor(private opts: AntiDuplicationPolicyOpts) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const { id, kind } = event;
    const { kv, expireIn = 60000, minLength = 50, deobfuscate } = this.opts;

    const content = deobfuscate?.(event) ?? event.content;

    if (kind === 1 && content.length >= minLength) {
      const hash = AntiDuplicationPolicy.hashCode(content);
      const key: Deno.KvKey = ['nostrify', 'policies', 'antiduplication', hash];

      const { value } = await kv.get(key);

      if (value) {
        await kv.set(key, true, { expireIn });
        return ['OK', id, false, 'blocked: the same message has been repeated too many times'];
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
