# Nostrify Strfry Policies

This package adapts [Nostrify policies](https://nostrify.dev/policy/) for use in [strfry policy plugins](https://github.com/hoytech/strfry/blob/master/docs/plugins.md).

## Example

```ts
#!/bin/sh
//bin/true; exec deno run -A "$0" "$@"
import {
  AntiDuplicationPolicy,
  FiltersPolicy,
  HellthreadPolicy,
  KeywordPolicy,
  PipePolicy,
  PowPolicy,
  RegexPolicy,
} from '@nostrify/policies';
import { strfry } from '@nostrify/strfry';

// Create a regular policy object however you want.
const policy = new PipePolicy([
  new FiltersPolicy([{ kinds: [0, 1, 3, 5, 7, 1984, 9734, 9735, 10002] }]),
  new KeywordPolicy(['https://t.me/']),
  new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i),
  new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']),
  new HellthreadPolicy({ limit: 100 }),
  new AntiDuplicationPolicy({ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }),
]);

// Call the `strfry` function at the bottom of the file.
// This hooks up to stdin/stdout and runs the policy on strfry input.
await strfry(policy);
```
