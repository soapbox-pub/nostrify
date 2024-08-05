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
 * ```
 */
export class Machina<T> implements AsyncIterable<T> {
  #queue: T[] = [];
  #resolve: (() => void) | undefined;
  #aborted = false;

  constructor(signal?: AbortSignal) {
    if (signal?.aborted) {
      this.abort();
    } else {
      signal?.addEventListener('abort', () => this.abort(), { once: true });
    }
  }

  /** Get messages as an AsyncIterable. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (!this.#aborted) {
      if (this.#queue.length) {
        yield this.#queue.shift() as T;
        continue;
      }

      await new Promise<void>((_resolve) => {
        this.#resolve = _resolve;
      });
    }

    throw new DOMException('The signal has been aborted', 'AbortError');
  }

  /** Push a message into the Machina instance, making it available to the consumer of `stream()`. */
  push(data: T): void {
    this.#queue.push(data);
    this.#resolve?.();
  }

  /** Stops streaming and throws an error to the consumer. */
  private abort(): void {
    this.#aborted = true;
    this.#resolve?.();
  }
}
