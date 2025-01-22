import { NPolicy } from '@nostrify/types';
import { JsonParseStream } from '@std/json';
import { TextLineStream } from '@std/streams';

import type { StrfryInputMessage, StrfryOutputMessage } from './types.ts';

/**
 * Reads strfry messages from stdin, processes them using the provided policy, and writes the results to stdout.
 * This enables the use of Nostrify policy modules in a strfry policy plugin.
 *
 * ```ts
 * import { strfry } from '@nostrify/strfry';
 *
 * const policy = // create policy here
 *
 * await strfry(policy);
 * ```
 */
export async function strfry(policy: NPolicy, opts?: { signal?: AbortSignal }): Promise<void> {
  const readable = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .pipeThrough(new JsonParseStream());

  for await (const line of readable) {
    const msg = line as unknown as StrfryInputMessage;
    const [, eventId, ok, reason] = await policy.call(msg.event, opts?.signal);

    const output: StrfryOutputMessage = {
      action: ok ? 'accept' : 'reject',
      id: eventId,
      msg: reason,
    };

    console.log(JSON.stringify(output));
  }
}
