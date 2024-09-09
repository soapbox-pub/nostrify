# Nostrify Policies

Policies allow you to prevent spam on your relay (or in your client).

Policies inspect one event at a time, which they either accept or reject. It's up to the application to decide how to handle the result.

```ts
import {
  AntiDuplicationPolicy,
  FiltersPolicy,
  HellthreadPolicy,
  KeywordPolicy,
  PipePolicy,
  PowPolicy,
  RegexPolicy,
} from '@nostrify/nostrify/policies';

const policy = new PipePolicy([
  new FiltersPolicy([{ kinds: [0, 1, 3, 5, 7, 1984, 9734, 9735, 10002] }]),
  new KeywordPolicy(['https://t.me/']),
  new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i),
  new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']),
  new HellthreadPolicy({ limit: 100 }),
  new AntiDuplicationPolicy({ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }),
]);

const [_, eventId, ok, reason] = await policy.call(event);
```

Full documentation: https://nostrify.dev/policy

## License

MIT
