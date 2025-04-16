# Blossom Uploader

[Blossom](https://github.com/hzrd149/blossom) is a new protocol that challenges IPFS with the simplicity of Nostr.

Files are uploaded to multiple servers and identified by their SHA-256 hash. If a server goes offline, clients may be able to locate the file on other servers.

## Usage

The [BlossomUploader](https://jsr.io/@nostrify/nostrify/doc/uploaders/~/BlossomUploader) can be used to upload files to multiple Blossom servers at once.

```ts
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

const uploader = new BlossomUploader({
  servers: ['https://blossom.primal.net/' /*, https://cdn.satellite.earth */],
  signer: window.nostr,
});

const tags = await uploader.upload(file);
```

### Options

- `servers` array of URLs to Blossom servers.
- `signer` Nostr signer instance to sign the upload request.
- `fetch` (optional) custom fetch implementation.
- `expiresIn` (optional) number of milliseconds each upload request should expire in. (Default: `60_000`)

## Results

Results are returned as a tags array (`string[][]`) of [NIP-94] tags. The first tag is guaranteed to be a `url`.

```ts
[
  ['url', 'https://blossom.primal.net/7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539.png'],
  ['x', '7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539'],
  ['ox', '7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539'],
  ['size', '172'],
  ['m', 'image/png'],
];
```

- `url` public URL of the file.
- `x` SHA-256 hex-encoded string of the file.
- `ox` SHA-256 hex-encoded string of the original file, before any transformations done by the upload server.
- `size` size of file in bytes.
- `m` string indicating the data type of the file. The [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types) format must be used, and they should be lowercase.

[NIP-94]: https://github.com/nostr-protocol/nips/blob/master/94.md
