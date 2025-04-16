---
outline: deep
---

# Uploaders

To share files on Nostr, we need to upload them somewhere.

Ideally we'll also get some metadata about the file, so we can display images in the correct proportions (and use nice loading features like [blurhash](https://blurha.sh)).

## NUploader

[`NUploader`](https://jsr.io/@nostrify/types/doc/~/NUploader) has a single `upload` method that take a file and returns metadata.

```ts
const file: File = /* your file */;

const uploader = new NostrBuildUploader(/* your options */);

// Get the URL and other metadata.
const [[_, url], ...tags] = await uploader.upload(file);
```

- Results are returned as a tags array (`string[][]`) of [NIP-94] tags.
- The first tag is guaranteed to be a `url` tag.

> [!INFO]
> Tags can represent all possible metadata on Nostr. They can be used directly in both NIP-94 and [NIP-92] events.

[NIP-92]: https://github.com/nostr-protocol/nips/blob/master/92.md
[NIP-94]: https://github.com/nostr-protocol/nips/blob/master/94.md

## Implementations

- [Blossom](/upload/blossom) - Uploads to one or more Blossom servers.
- [nostr.build](/upload/nostr-build) - Uploads to nostr.build or any compatible server.

## Usage

### In NIP-94 events

The result can be used directly in the `tags` property of a NIP-94 upload event.

```ts
const tags = await uploader.upload(file);

const event = {
  kind: 1063,
  content: '',
  tags: tags,
};
```

### In Kind 1 and others

The result can be easily converted into an `imeta` tag for use in other kinds of events.

```ts
const imeta = await uploader.upload(file);

const event = {
  kind: 1,
  content: `hello world!\n\n${url}`,
  tags: [
    ['imeta', ...imeta.map((value) => value.join(' '))],
  ],
};
```

### Mapping to other types

Use `.find` to get values directly from the results.

```ts
const tags = await uploader.upload(file);

const url = tags.find(([name]) => name === 'url')?.[1];
const m = tags.find((name) => name === 'm')?.[1];
const x = tags.find((name) => name === 'x')?.[1];
const size = tags.find((name) => name === 'size')?.[1];
const dim = tags.find((name) => name === 'dim')?.[1];
const blurhash = tags.find((name) => name === 'blurhash')?.[1];
```

> [!TIP]
> This is a common pattern. You might be tempted to create a helper function, but we recommend doing the dirty work everywhere.

## Possible values

All the types of [NIP-94] are supported, and repeated below.

- `url` public URL of the file.
- `m` string indicating the data type of the file. The [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types) format must be used, and they should be lowercase.
- `x` SHA-256 hex-encoded string of the file.
- `ox` SHA-256 hex-encoded string of the original file, before any transformations done by the upload server.
- `size` size of file in bytes.
- `dim` dimensions of file in pixels `<width>x<height>`.
- `magnet` URI to magnet file.
- `i` torrent infohash.
- `blurhash` the [blurhash](https://github.com/woltapp/blurhash) to show while the file is being loaded by the client.
- `thumb` thumbnail URL with the same aspect ratio.
- `image` preview image URL with the same dimensions.
- `summary` text excerpt.
- `alt` description for accessibility.
- `fallback` zero or more fallback file sources in case `url` fails.

## Custom Uploaders

To create a custom uploader, implement the `NUploader` class:

```ts
import { NUploader } from '@nostrify/nostrify';

class MyUploader implements NUploader {
  async upload(file: File): Promise<[['url', string], ...string[][]]> {
    // Upload the file and return tags.
  }
}
```