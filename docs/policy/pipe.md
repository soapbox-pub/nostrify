# Policy Pipelines

Policies can be composed into pipelines, allowing you to reject events based on multiple criteria.

This is achieved with the [`PipePolicy`](https://jsr.io/@nostrify/nostrify/doc/policies/~/PipePolicy) class, which accepts an array of policies and runs them in order. If any policy rejects the event, the pipeline stops and the event is rejected.

You can also use the [`AnyPolicy`](https://jsr.io/@nostrify/nostrify/doc/policies/~/AnyPolicy) class to accept an event if any policy accepts it.

Furthermore, PipePolicy and AnyPolicy are themselves policies! So you can create nested pipelines for complex rules.

## Simple Pipeline

The following example runs each policy in order and rejects the event if any policy rejects.

```ts
import {
  AntiDuplicationPolicy,
  FiltersPolicy,
  HellthreadPolicy,
  KeywordPolicy,
  PipePolicy,
  PowPolicy,
  RegexPolicy,
} from '@nostrify/policies';

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

> [!TIP]
> Order matters. While any policy can reject an event, you can optimize performance by placing simpler policies first.

## Nested Pipeline

You can create nested pipelines by using PipePolicy and AnyPolicy within each other.

In this example, certain phrases are banned unless the event meets a proof-of-work requirement.

```ts
import { AnyPolicy, PipePolicy } from '@nostrify/policies';

const policy = new AnyPolicy([
  new PowPolicy({ difficulty: 5 }),
  new PipePolicy([
    new KeywordPolicy(['https://t.me/']),
    new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i),
  ]),
]);
```

You can compose this into a bigger policy.

```ts
import { AntiDuplicationPolicy, AnyPolicy, HellthreadPolicy, PipePolicy, PubkeyBanPolicy } from '@nostrify/policies';

const policy = new PipePolicy([
  new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']),
  new HellthreadPolicy({ limit: 100 }),
  new AnyPolicy([
    new PowPolicy({ difficulty: 5 }),
    new PipePolicy([
      new KeywordPolicy(['https://t.me/']),
      new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i),
    ]),
  ]),
  new AntiDuplicationPolicy({ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }),
]);
```
