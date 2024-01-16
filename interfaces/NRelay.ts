export interface NRelay {
  cmd(cmd: [string, ...unknown[]]): Promise<void>;
  [Symbol.asyncIterator](): AsyncGenerator<[string, ...unknown[]]>;
}
