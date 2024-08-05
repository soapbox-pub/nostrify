import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/** Rejects if the policy passes, passes if the policy rejects. */
export class InvertPolicy implements NPolicy {
  constructor(private policy: NPolicy, private reason: string) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const result = await this.policy.call(event);
    const ok = result[2];

    if (ok) {
      return ['OK', event.id, false, this.reason];
    } else {
      return ['OK', event.id, true, ''];
    }
  }
}
