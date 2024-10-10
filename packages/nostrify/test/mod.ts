import { NostrEvent } from '@nostrify/types';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

export { ErrorRelay } from './ErrorRelay.ts';
export { MockRelay } from './MockRelay.ts';

/** Import a JSONL fixture by name in tests. */
export async function jsonlEvents(path: string): Promise<NostrEvent[]> {
  const data = await Deno.readTextFile(path);
  return data.split('\n').map((line) => JSON.parse(line));
}

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
