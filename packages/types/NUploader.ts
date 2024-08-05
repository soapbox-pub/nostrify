/**
 * Nostr uploader class.
 *
 * Accepts a file and uploads it according to the implementation.
 * It returns file metadata as [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md) tags.
 * The first value is guaranteed to be the public URL of the uploaded file.
 */
export interface NUploader {
  /** Upload the file and get back NIP-94 tags. */
  upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]>;
}
