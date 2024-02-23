/**
 * Infinite async generator. Iterates messages pushed to it until closed.
 * Only one consumer is expected to use a Machina instance at a time.
 *
 * @example
 * ```ts
 * // Create the Machina instance
 * const machina = new Machina<string>();
 *
 * // Async generator loop
 * async function getMessages() {
 *   for await (const msg of machina.stream()) {
 *     console.log(msg);
 *   }
 * }
 *
 * // Start the generator
 * getMessages();
 *
 * // Push messages to it
 * machina.push('hello!');
 * machina.push('whats up?');
 * machina.push('greetings');
 *
 * // Stop the generator
 * machina.close();
 * ```
 */
export class Machina<T> {
  #open = true;
  #queue: T[] = [];
  #resolve: (() => void) | undefined;

  constructor(signal?: AbortSignal) {
    if (signal?.aborted) {
      this.close();
    } else {
      signal?.addEventListener('abort', () => this.close(), { once: true });
    }
  }

  /** Get messages as an AsyncGenerator. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    this.#open = true;

    while (this.#open) {
      if (this.#queue.length) {
        yield this.#queue.shift()!;
        continue;
      }

      await new Promise<void>((_resolve) => {
        this.#resolve = _resolve;
      });
    }
  }

  /** Push a message into the Machina instance, making it available to the consumer of `stream()`. */
  push(data: T): void {
    this.#queue.push(data);
    this.#resolve?.();
  }

  /** Closes the Machina instance, ending the stream. Calling `stream()` again causes it to be re-opened. */
  close(): void {
    this.#open = false;
    this.#resolve?.();
  }
}
