import { NostrEvent } from '../../types/NostrEvent.ts';
import { NostrRelayOK } from '../../types/NostrRelayMsg.ts';
import { NPolicy } from '../../types/NPolicy.ts';

/** This policy rejects all messages. */
export class ReadOnlyPolicy implements NPolicy {
  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return ['OK', event.id, false, 'blocked: the relay is read-only'];
  }
}
