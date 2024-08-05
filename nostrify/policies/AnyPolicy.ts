import { NostrEvent } from '../../interfaces/NostrEvent.ts';
import { NostrRelayOK } from '../../interfaces/NostrRelayMsg.ts';
import { NPolicy } from '../../interfaces/NPolicy.ts';

/** Similar to `PipePolicy`, but passes if at least one policy passes. */
export class AnyPolicy implements NPolicy {
  constructor(private policies: NPolicy[]) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    let result: NostrRelayOK = ['OK', event.id, false, 'blocked: no policy passed'];

    for (const policy of this.policies) {
      result = await policy.call(event);

      const ok = result[2];
      if (ok) {
        return result;
      }
    }

    return result;
  }
}
