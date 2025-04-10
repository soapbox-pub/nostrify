export function parseBunkerUri(uri: string): { pubkey: string; secret?: string; relays: string[] } {
  const url = new URL(uri);
  const params = new URLSearchParams(url.search);

  // https://github.com/denoland/deno/issues/26440
  const pubkey = url.hostname || url.pathname.slice(2);
  const secret = params.get('secret') ?? undefined;
  const relays = params.getAll('relay');

  if (!pubkey) {
    throw new Error('Invalid bunker URI');
  }

  return { pubkey, secret, relays };
}
