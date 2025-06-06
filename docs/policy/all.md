# Policy List

Below are the [policies](/policy/) shipped with Nostrify.

## AntiDuplicationPolicy

Prevent messages with the exact same content from being submitted repeatedly.

It uses [Deno KV](https://docs.deno.com/deploy/kv/manual) to track repeated messages.

```ts
import { AntiDuplicationPolicy } from '@nostrify/policies';

const kv = await Deno.openKv();

// Reject messages with the same content within 60 seconds.
const policy = new AntiDuplicationPolicy({ kv, expireIn: 60000, minLength: 50 });
```

### Options

- `kv`: A Deno KV instance.
- `expireIn`: The time in milliseconds before a message with this content can be submitted again (since the last time it was posted).
- `minLength`: The minimum length of a message to be considered for deduplication.

## AnyPolicy

A type of [pipeline policy](/policy/pipe) that passes an event if any of its sub-policies pass.

```ts
import { AnyPolicy } from '@nostrify/policies';

// Block Telegram links unless there is sufficient proof-of-work.
const policy = new AnyPolicy([
  new KeywordPolicy(['https://t.me/']),
  new PowPolicy({ difficulty: 5 }),
]);
```

## DomainPolicy

Filters events by the author's NIP-05 domain.

The policy requires event authors to have a kind 0 event with a valid `nip05` property.
The first argument is an [`NStore`](/store/) instance used to retrieve the kind 0.

```ts
import { DomainPolicy } from '@nostrify/policies';

const policy = new DomainPolicy(store, {
  blacklist: ['replyguy.dev', 'ethereum.xyz'],
});
```

When a domain is blacklisted, all subdomains are also blocked. For example, blacklisting `replyguy.dev` will also block `spam.replyguy.dev` and `bot.spam.replyguy.dev`.

### Options

- `blacklist`: An array of domains to reject (including all subdomains).
- `whitelist`: If provided, only events from these domains are accepted.
- `lookup`: Custom NIP-05 lookup function.

## FiltersPolicy

Reject events that don't match the filters.

```ts
import { FiltersPolicy } from '@nostrify/policies';

// Only accept events with kinds 0, 1, 3, 5, 6, or 7.
const policy = new FiltersPolicy([{ kinds: [0, 1, 3, 5, 6, 7] }]);
```

## HashtagPolicy

Reject events containing any of the banned hashtags.

```ts
import { HashtagPolicy } from '@nostrify/policies';

// Reject events containing 'nsfw'.
const policy = new HashtagPolicy(['nsfw']);
```

## HellthreadPolicy

Reject messages that tag too many participants.

This rule only affects kind 1 text notes, and it counts the number of "p" tags.

```ts
import { HellthreadPolicy } from '@nostrify/policies';

// Reject kind 1 events with more than 15 "p" tags.
const policy = new HellthreadPolicy({ limit: 15 });
```

### Options

- `limit`: The maximum number of "p" tags that can be on kind 1 events.

## InvertPolicy

Inverts the result of another policy.

The second parameter is the message to return if the policy rejects the event.

```ts
import { InvertPolicy } from '@nostrify/policies';

// Reject events unless they contain 'moo'.
const policy = new InvertPolicy(
  new KeywordPolicy(['moo']),
  'blocked: event did not contain "moo"',
);
```

## KeywordPolicy

Reject events containing any of the strings in its content.

```ts
import { KeywordPolicy } from '@nostrify/policies';

// Reject events containing 'moo', 'oink', or 'honk'.
const policy = new KeywordPolicy(['moo', 'oink', 'honk']);
```

## NoOpPolicy

Minimal sample policy for demonstration purposes. Allows all events through.

```ts
import { NoOpPolicy } from '@nostrify/policies';

const policy = new NoOpPolicy();
```

## OpenAIPolicy

Sends event content to OpenAI's [Moderations API](https://platform.openai.com/docs/api-reference/moderations) and then rejects flagged events.

```ts
import { OpenAIPolicy } from '@nostrify/policies';

// Reject events with a high toxicity score.
const policy = new OpenAIPolicy({ apiKey: Deno.env.get('OPENAI_API_KEY') });
```

You can also provide a custom handler for more fine-grained control.

```ts
new OpenAIPolicy({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  handler(event, data) {
    // Loop each result.
    return data.results.some((result) => {
      if (result.flagged) {
        const { sexual, violence } = result.categories;
        // Reject only events flagged as sexual and violent.
        return sexual && violence;
      }
    });
  },
});
```

### Options

- `apiKey`: Your OpenAI API key.
- `handler`: Custom handler to process the OpenAI response. Rejects the event if the handler returns `true`.
- `endpoint`: Custom endpoint to use instead of `https://api.openai.com/v1/moderations`.
- `fetch`: Custom fetch implementation.
- `timeout`: Timeout in milliseconds for each fetch request.
- `kinds`: Array of kinds to apply the policy to.

## PipePolicy

Compose multiple policies into a single policy.

It is a type of [pipeline policy](/policy/pipe).

```ts
import {
  AntiDuplicationPolicy,
  FiltersPolicy,
  HellthreadPolicy,
  PipePolicy,
  PubkeyBanPolicy,
} from '@nostrify/policies';

// Reject messages unless they pass all policies.
const policy = new PipePolicy([
  new FiltersPolicy([{ kinds: [0, 1, 3, 5, 7, 1984, 9734, 9735, 10002] }]),
  new PubkeyBanPolicy(['e810fafa1e89cdf80cced8e013938e87e21b699b24c8570537be92aec4b12c18']),
  new HellthreadPolicy({ limit: 100 }),
  new AntiDuplicationPolicy({ kv: await Deno.openKv(), expireIn: 60000, minLength: 50 }),
]);
```

## PowPolicy

Reject events which don't meet Proof-of-Work ([NIP-13](https://github.com/nostr-protocol/nips/blob/master/13.md)) criteria.

```ts
import { PowPolicy } from '@nostrify/policies';

// Require events to have proof-of-work of at least 10.
const policy = new PowPolicy({ difficulty: 10 });
```

### Options

- `difficulty`: The minimum difficulty required for the event to pass.

## PubkeyBanPolicy

Ban events from specific pubkeys.

```ts
import { PubkeyBanPolicy } from '@nostrify/policies';

// Reject events from these pubkeys.
const policy = new PubkeyBanPolicy(['e810...', 'fafa...', '1e89...']);
```

## ReadOnlyPolicy

This policy rejects all messages.

```ts
import { ReadOnlyPolicy } from '@nostrify/policies';

const policy = new ReadOnlyPolicy();
```

## RegexPolicy

Reject events whose content matches the regex.

```ts
import { RegexPolicy } from '@nostrify/policies';

// Reject events containing '🟠', '🔥', or '😳' followed by 'ChtaGPT'.
const policy = new RegexPolicy(/(🟠|🔥|😳)ChtaGPT/i);
```

## SizePolicy

Reject events that are too large.

```ts
import { SizePolicy } from '@nostrify/policies';

// Reject events larger than 8 Kb.
const policy = new SizePolicy({ maxBytes: 8 * 1024 });
```

## WhitelistPolicy

Allows only the listed pubkeys to post to the relay. All other events are rejected.

```ts
import { WhitelistPolicy } from '@nostrify/policies';

// Only allow events from these pubkeys.
const policy = new WhitelistPolicy(['e810...', 'fafa...', '1e89...']);
```
