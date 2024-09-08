import { NostrEvent } from '@nostrify/types';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

export { MockRelay } from './MockRelay.ts';

/** Generate an event for use in tests. */
export function genEvent(t: Partial<NostrEvent> = {}, sk: Uint8Array = generateSecretKey()): NostrEvent {
  const { id, kind, pubkey, tags, content, created_at, sig } = finalizeEvent({
    kind: 255,
    created_at: 0,
    content: '',
    tags: [],
    ...t,
  }, sk);

  return { id, kind, pubkey, tags, content, created_at, sig };
}
