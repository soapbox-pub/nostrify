import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/** Basic policy to demonstrate how policies work. Accepts all events. */
export class NoOpPolicy implements NPolicy {
  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return ['OK', event.id, true, ''];
  }
}
