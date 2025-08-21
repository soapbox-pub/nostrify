import type { NPolicy } from '@nostrify/types';
import * as readline from 'node:readline';

import type { StrfryInputMessage, StrfryOutputMessage } from './types.ts';
import process from 'node:process';

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
export async function strfry(
  policy: NPolicy,
  optsFn?: () => { signal?: AbortSignal },
): Promise<void> {
  // Use Node.ts's readline module to read from stdin line by line.
  // This is the equivalent of Deno's TextLineStream.
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity, // Handles all line endings correctly.
  });

  // The 'line' event is emitted for each line of input.
  // This replaces the `for await...of` loop over the Deno stream.
  for await (const line of rl) {
    if (!line.trim()) {
      continue; // Skip empty lines
    }

    let msg: StrfryInputMessage;
    try {
      // Manually parse each line as JSON.
      // This replaces Deno's JsonParseStream.
      msg = JSON.parse(line) as StrfryInputMessage;
    } catch (error) {
      console.error('Failed to parse incoming JSON:', error);
      continue; // Skip malformed lines
    }

    try {
      // The AbortSignal logic remains the same, as AbortController/AbortSignal
      // are standard in modern Node.js versions.
      const { signal } = optsFn?.() ?? {};
      const [, eventId, ok, reason] = await policy.call(msg.event, signal);

      const output: StrfryOutputMessage = {
        action: ok ? 'accept' : 'reject',
        id: eventId,
        msg: reason,
      };

      // Writing to stdout is the same in Node.js.
      console.log(JSON.stringify(output));
    } catch (error) {
      // Error handling logic is also identical.
      if (error instanceof Error && error.name === 'AbortError') {
        const output: StrfryOutputMessage = {
          action: 'reject',
          id: msg.event.id,
          msg: 'error: relay policy plugin timed out',
        };
        console.log(JSON.stringify(output));
      } else {
        const output: StrfryOutputMessage = {
          action: 'reject',
          id: msg.event.id,
          msg: 'error: an unexpected error occurred',
        };
        console.log(JSON.stringify(output));
      }
    }
  }
}
