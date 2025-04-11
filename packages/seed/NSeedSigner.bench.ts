import { NSeedSigner } from './NSeedSigner.ts';

Deno.bench('NSeedSigner', (b) => {
  const seed = new TextEncoder().encode('41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U');
  b.start();
  new NSeedSigner(seed);
});
