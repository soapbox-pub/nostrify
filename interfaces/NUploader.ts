export interface NUploader {
  upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]>;
}
