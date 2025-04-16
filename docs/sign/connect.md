# Nostr Connect

The [`NConnectSigner`](https://jsr.io/@nostrify/nostrify/doc/~/NConnectSigner) class signs events over a relay with a remote signer, according to [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md).

## Usage

First get the user's pubkey and a relay to sign with. This will likely come from a `bunker://` URI.

Next you will need to create a local signer instance, connect to a relay, and then create a new NConnectSigner.

```ts
import { NConnectSigner, NSecSigner, NRelay1 } from '@nostrify/nostrify';
import { generateSecretKey } from 'nostr-tools';

const local = new NSecSigner(generateSecretKey());
const relay = new NRelay1('wss://example.tld/relay');
const pubkey = /* get the user's pubkey */;

const signer = new NConnectSigner({
  pubkey,
  signer: local,
  relay,
});
```

For most applications, you will also need to authenticate with the signer by connecting with a secret.

```ts
await signer.connect(/* your secret */);
```

You now have a NostrSigner object, allowing you to call methods like `.getPublicKey()` and `.signEvent()`.

## Options

- `pubkey` - The pubkey of the user to sign events.
- `signer` - A local signer instance (probably `NSecSigner`).
- `relay` - The relay to connect to.
- `timeout` - The time in milliseconds to wait for each response from the relay. Default is to wait forever.
- `encryption` - `'nip04'` or `'nip44'`. Default is `'nip04'`.

> [!TIP]
> Setting a `timeout` is highly recommended for production use.

## Connect

The `connect` method is used to authenticate with the remote signer.
This is required in some applications before you can sign events.

```ts
await signer.connect(/* your secret */);
```

The `secret` may be found in a `bunker://` URI. In some applications it may not be required. You can also call `connect` without any arguments.

```ts
await signer.connect();
```

## Ping

NIP-46 also supports a `ping` command. This can be used to check if the remote signer is still connected.

```ts
await signer.ping();
```

This method will return `"pong"`, or throw an error if the remote signer is not connected.

## Encryption

Nostr Connect [still uses NIP-04](https://github.com/nostr-protocol/nips/issues/1095) while the ecosystem transitions to NIP-44.

NConnectSigner lets you specify the encryption method to use. By default it uses NIP-04, but you can specify the `encryption` option to use NIP-44:

```ts
const signer = new NConnectSigner({
  pubkey,
  signer: local,
  relay,
  encryption: 'nip44',
});
```

> [!NOTE]
> NIP-44 is not yet widely supported by remote signers. If you use NIP-44, you may not be able to connect to some remote signers.