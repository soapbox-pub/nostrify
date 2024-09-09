import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/** Similar to `PipePolicy`, but passes if at least one policy passes. */
export class AnyPolicy implements NPolicy {
  constructor(private policies: NPolicy[]) {}

  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    let result: NostrRelayOK = ['OK', event.id, false, 'blocked: no policy passed'];

    for (const policy of this.policies) {
      result = await policy.call(event, signal);

      const ok = result[2];
      if (ok) {
        return result;
      }
    }

    return result;
  }
}
