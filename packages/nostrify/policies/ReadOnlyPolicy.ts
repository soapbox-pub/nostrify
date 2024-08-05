import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/** This policy rejects all messages. */
export class ReadOnlyPolicy implements NPolicy {
  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return ['OK', event.id, false, 'blocked: the relay is read-only'];
  }
}
