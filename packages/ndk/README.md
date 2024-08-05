# Nostrify ❤️ NDK

This package connects [NDK](https://github.com/nostr-dev-kit/ndk) with Nostrify, allowing you to use NDK as a regular Nostrify relay.

```ts
import NDK from '@nostr-dev-kit/ndk';
import { NDKStore } from '@nostrify/ndk';

const ndk = new NDK(/* set up NDK */);
await ndk.connect();

const relay = new NDKStore(ndk); // `NStore` compatible
```

## License

MIT
