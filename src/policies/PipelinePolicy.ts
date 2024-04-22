import { NostrEvent } from '../../interfaces/NostrEvent.ts';
import { NostrRelayOK } from '../../interfaces/NostrRelayMsg.ts';
import { NPolicy } from '../../interfaces/NPolicy.ts';

/**
 * Processes events through multiple policies.
 *
 * If any policy rejects, the pipeline will stop and return the rejected message.
 *
 * ```ts
 * const policy = new PipelinePolicy([
 *   new NoOpPolicy(),
 *   new FiltersPolicy([{ kinds: [0, 1, 3, 5, 7, 1984, 9734, 9735, 10002] }]),
 *   new KeywordPolicy(['https://t.me/']),
 *   new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i),
 *   new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']),
 *   new HellthreadPolicy({ limit: 100 }),
 *   new AntiDuplicationPolicy({ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }),
 * ]);
 *
 * const [_, eventId, ok, reason] = await policy.call(event);
 * ```
 */
export class PipelinePolicy implements NPolicy {
  constructor(private policies: NPolicy[]) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    for (const policy of this.policies) {
      const [_, eventId, ok, reason] = await policy.call(event);

      if (!ok) {
        return [_, eventId, ok, reason];
      }
    }

    return ['OK', event.id, true, ''];
  }
}
