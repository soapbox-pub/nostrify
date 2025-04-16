# nostr.build Uploader

[nostr.build](https://nostr.build) is the classic Nostr uploader service that has offered free service since 2022. It is also [open source](https://github.com/nostrbuild/nostr.build), so you can host your own instance.

## Usage

The [NostrBuildUploader](https://jsr.io/@nostrify/nostrify/doc/uploaders/~/NostrBuildUploader) can be used to upload files to nostr.build or any compatible server.

```ts
import { NostrBuildUploader } from '@nostrify/nostrify/uploaders';

const uploader = new NostrBuildUploader(); // No options required!

const [[_, url], ...tags] = await uploader.upload(file);
```

### Options

- `endpoint` (optional) URL to make the API request. (Default: `https://nostr.build/api/v2/upload/files`)
- `signer` (optional) Nostr signer instance to sign the upload request. This can by handy if you want to associate your uploads with your account, or if you have a paid account on nostr.build.
- `fetch` (optional) custom fetch implementation.

## Results

Results are returned as a tags array (`string[][]`) of [NIP-94] tags. The first tag is guaranteed to be a `url`.

```ts
[
  ['url', 'https://image.nostr.build/7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539.png'],
  ['m', 'image/png'],
  ['x', '21608eecb7df80ca3838deb428fd6568a0d0d3b1baac56491e2247a1c110649a'],
  ['ox', '7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539'],
  ['size', '171'],
  ['dim', '16x16'],
  ['blurhash', 'LCB20ssn0+NcbsfjRmaz12WW}osn'],
]
```

- `url` public URL of the file.
- `m` string indicating the data type of the file. The [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types) format must be used, and they should be lowercase.
- `x` SHA-256 hex-encoded string of the file.
- `ox` SHA-256 hex-encoded string of the original file, before any transformations done by the upload server.
- `size` size of file in bytes.
- `dim` dimensions of file in pixels `<width>x<height>`.
- `blurhash` the [blurhash](https://github.com/woltapp/blurhash) to show while the file is being loaded by the client.

[NIP-94]: https://github.com/nostr-protocol/nips/blob/master/94.md
