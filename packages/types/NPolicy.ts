import { NostrEvent } from './NostrEvent.ts';
import { NostrRelayInfo } from './NostrRelayInfo.ts';
import { NostrRelayOK } from './NostrRelayMsg.ts';

/**
 * Nostr moderation policy.
 *
 * Analyzes the event, possibly making calls to external sources, and then
 * responds with a message to either accept or reject the event.
 */
export interface NPolicy {
  /** Invoke the policy. If `ok` is set to false, the application should not store or display the message. */
  call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK>;
  /** If this policy would impact a NIP-11 field, those fields are defined here. */
  info?: NostrRelayInfo;
}
