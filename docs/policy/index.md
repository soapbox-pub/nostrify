# Moderation Policies

Policies allow you to prevent spam on your relay (or in your client).

Nostrify introduces a model for writing policies and composing them in pipelines. Policies are fully configurable and it's easy to add your own or install more from anywhere on the net!

## Usage

Policies inspect one event at a time, which they either accept or reject.
It's up to the application to decide how to handle the result.

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

[Pipelines](/policy/pipe) can be used to chain policies together, to accept or reject events based on multiple criteria.

## The NPolicy Interface

Policies use a simple interface, [`NPolicy`](https://jsr.io/@nostrify/types/doc/~/NPolicy), which accepts an event and returns a relay 'OK' message.

```ts
interface NPolicy {
  call(event: NostrEvent): Promise<NostrRelayOK>;
}
```

If the [`NostrRelayOK`](https://jsr.io/@nostrify/types/doc/~/NostrRelayOK) message returns `false`, the event should be rejected (or not shown to users).

## Included Policies

Nostrify ships with a few policies to get you started.

| Policy                                                     | Description                                                                                                                 | Example Options                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [AntiDuplicationPolicy](/policy/all#antiduplicationpolicy) | Prevent messages with the exact same content from being submitted repeatedly.                                               | `{ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }` |
| [AnyPolicy](/policy/all#anypolicy)                         | Accepts an event if any policy accepts it.                                                                                  | `[new PowPolicy(), new KeywordPolicy()]`                      |
| [DomainPolicy](/policy/all#domainpolicy)                   | Filters events by the author's NIP-05 domain.                                                                               | `{ blacklist: ['replyguy.dev'] }`                             |
| [FiltersPolicy](/policy/all#filterspolicy)                 | Reject events that don't match the filters.                                                                                 | `[{ kinds: [0, 1, 3, 5, 6, 7] }]`                             |
| [HashtagPolicy](/policy/all#hashtagpolicy)                 | Reject events containing any of the banned hashtags.                                                                        | `['nsfw']`                                                    |
| [HellthreadPolicy](/policy/all#hellthreadpolicy)           | Reject messages that tag too many participants.                                                                             | `{ limit: 15 }`                                               |
| [InvertPolicy](/policy/all#invertpolicy)                   | Inverts the result of another policy.                                                                                       | `new PubkeyBanPolicy([...])`                                  |
| [KeywordPolicy](/policy/all#keywordpolicy)                 | Reject events containing any of the strings in its content.                                                                 | `['moo', 'oink', 'honk']`                                     |
| [NoOpPolicy](/policy/all#nooppolicy)                       | Minimal sample policy for demonstration purposes. Allows all events through.                                                |                                                               |
| [OpenAIPolicy](/policy/all#openaipolicy)                   | Passes event content to OpenAI and then rejects flagged events.                                                             | `{ apiKey: '123...' }`                                        |
| [PipePolicy](/policy/all#pipepolicy)                       | Compose multiple policies into a single policy.                                                                             | `[new PowPolicy(), new KeywordPolicy()]`                      |
| [PowPolicy](/policy/all#powpolicy)                         | Reject events which don't meet Proof-of-Work ([NIP-13](https://github.com/nostr-protocol/nips/blob/master/13.md)) criteria. | `{ difficulty: 20 }`                                          |
| [PubkeyBanPolicy](/policy/all#pubkeybanpolicy)             | Ban individual pubkeys from publishing events to the relay.                                                                 | `['e810...', 'fafa...', '1e89...']`                           |
| [ReadOnlyPolicy](/policy/all#readonlypolicy)               | This policy rejects all messages.                                                                                           |                                                               |
| [RegexPolicy](/policy/all#regexpolicy)                     | Reject events whose content matches the regex.                                                                              | `/(🟠\|🔥\|😳)ChtaGPT/i`                                      |
| [SizePolicy](/policy/all#sizepolicy)                       | Reject events that are too large.                                                                                           | `{ maxBytes: 8192 }`                                          |
| [WhitelistPolicy](/policy/all#whitelistpolicy)             | Allows only the listed pubkeys to post to the relay. All other events are rejected.                                         | `['e810...', 'fafa...', '1e89...']`                           |

See [All Policies](/policy/all) for more information.

## Custom Policies

You can create your own policy by implementing [`NPolicy`](https://jsr.io/@nostrify/types/doc/~/NPolicy). This allows you to reject events based on any criteria you choose.

```ts
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';

class MyPolicy implements NPolicy {
  constructor(/* your options */) {
    // Use the constructor to add any additional information you need.
  }

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    if (/* check if should reject */) {
      return ['OK', event.id, false, 'blocked: event did not meet criteria'];
    }

    // Allow other events.
    return ['OK', event.id, true, ''];
  }
}
```

## Other Uses

Policies are useful for preventing spam or enforcing rules on a relay. But they can also be used to collect statistics, trigger side-effects, and more.
