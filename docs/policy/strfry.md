# strfry Policies

Nostrify policies can be used with the [strfry](https://github.com/hoytech/strfry) relay to create custom policy scripts.

For more information about strfry policy plugins, see [strfry: Write policy plugins](https://github.com/hoytech/strfry/blob/master/docs/plugins.md).

## System Setup

To get up and running, you will need to install Deno on the same machine as strfry:

```sh
sudo apt install -y unzip
curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh
```

Create an entrypoint file somewhere and make it executable:

```sh
sudo touch /opt/policy.ts
sudo chmod +x /opt/policy.ts
```

Let's start with a minimal policy file that accepts all events:

```ts
#!/bin/sh
//bin/true; exec deno run -A "$0" "$@"

import { NoOpPolicy } from 'jsr:@nostrify/policies';
import { strfry } from 'jsr:@nostrify/strfry;

const policy = new NoOpPolicy(); // accept all events

await strfry(policy);
```

Finally, edit `strfry.conf` and enable the policy:

```diff
     writePolicy {
         # If non-empty, path to an executable script that implements the writePolicy plugin logic
-        plugin = ""
+        plugin = "/opt/policy.ts"
 
         # Number of seconds to search backwards for lookback events when starting the writePolicy plugin (0 for no lookback)
         lookbackSeconds = 0
```

That's it! 🎉 Now you should check strfry logs (`journalctl -eu strfry`) to ensure everything is working okay.

## Policy Script

Now you can write your custom policy. Here's a starting point:

```ts
#!/bin/sh
//bin/true; exec deno run --unstable-kv -A "$0" "$@"
import {
  AntiDuplicationPolicy,
  FiltersPolicy,
  HellthreadPolicy,
  KeywordPolicy,
  PipePolicy,
  PowPolicy,
  RegexPolicy,
} from 'jsr:@nostrify/policies';
import { strfry } from 'jsr:@nostrify/strfry';

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

> [!NOTE]
> The comments at the top of the file are necessary for strfry to execute the script in Deno correctly.
> To use advanced features of Deno, it may need to be modified. In this case, the `--unstable-kv` flag was added.

> [!TIP]
> See the [Policy List](/policy/all) for a full list of available policies in Nostrify.

## How it Works

The [`strfry()`](https://jsr.io/@nostrify/strfry/doc/~/strfry) function in Nostrify acts as a glue layer between strfry's stdin/stdout and Nostrify policies.

This means you can use Nostrify to write [policies for Ditto](https://docs.soapbox.pub/ditto/policies) and strfry at the same time.

See [`@nostrify/strfry`](https://jsr.io/@nostrify/strfry) on JSR for more details.

## Advanced Policies

### Relay Introspection

It's possible to make the policy script connect back to the strfry relay itself.
For example, this policy fetches the kind 0 of each event's author from the relay, and accepts only events from users with verified NIP-05 domains:

```ts
#!/bin/sh
//bin/true; exec deno run -A '$0' '$@'

import { NRelay1 } from 'jsr:@nostrify/nostrify';
import { DomainPolicy } from 'jsr:@nostrify/policies';
import { strfry } from 'jsr:@nostrify/strfry';

const store = new NRelay1('ws://127.0.0.1:7777'); // connect to strfry relay
const policy = new DomainPolicy(store); // enforce valid NIP-05 authors

await strfry(policy);
```

### Policy Timeouts

If your policy connects to external services (like doing NIP-05 lookups), it's imperative to pass a timeout, otherwise the request will be allowed to run forever which would harm performance of your relay.

Do so by passing a second argument to the `strfry` function:

```ts
await strfry(policy, () => ({ signal: AbortSignal.timeout(3000) })); // 3s
```
