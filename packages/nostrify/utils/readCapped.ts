/**
 * Read a stream into memory, giving up once more than `maxSize` bytes have
 * arrived rather than holding whatever the other end decided to send.
 *
 * `Response.arrayBuffer()`, `Request.text()` and friends buffer the whole body.
 * That is fine for a body you produced and a hazard for one that reaches you
 * from a stranger — an unauthenticated HTTP client, or a host named by a
 * user-supplied identifier — since the size is theirs to choose.
 *
 * Peak memory is bounded by `maxSize` plus one chunk. `message` is the error
 * thrown when the limit is passed, so callers can phrase it for their context.
 */
export async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxSize: number,
  message: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;

      if (size > maxSize) {
        throw new Error(message);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}
