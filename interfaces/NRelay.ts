export interface NRelay {
  cmd(cmd: [verb: string, ...unknown[]]): Promise<void>;
  [Symbol.asyncIterator](): AsyncGenerator<[verb: string, ...unknown[]]>;
}
