import { NostrEvent } from '../../interfaces/NostrEvent.ts';
import { NostrRelayOK } from '../../interfaces/NostrRelayMsg.ts';
import { NPolicy } from '../../interfaces/NPolicy.ts';

/** Basic policy to demonstrate how policies work. Accepts all events. */
export class NoOpPolicy implements NPolicy {
  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return ['OK', event.id, true, ''];
  }
}
