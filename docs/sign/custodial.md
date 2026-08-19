# Custodial Signer

The `NCustodial` class is useful for custodial auth where you want to manage one secret for the entire application.

Pass a shared secret into it, then it will generate keys for your users determinstically.

NCustodial is a Map-like with user IDs as keys and signer instances as values.

## Usage

```ts
import { NCustodial } from '@nostrify/nostrify';

const SECRET_KEY = Deno.env.get('SECRET_KEY'); // generate with `openssl rand -base64 48`
const seed = new TextEncoder().encode(SECRET_KEY);

const signers = new NCustodial(seed);

const alex = await signers.get('alex');
const fiatjaf = await signers.get('fiatjaf');

alex.getPublicKey();
fiatjaf.signEvent(t);
```

## How it Works

The custodial signer combines the shared secret with the user ID to create a unique seed for each user.
The seed is then used to create a [seed signer](/sign/seed) for each user.

## The shared secret

The secret must be at least 32 bytes; anything shorter is rejected by the constructor.

HMAC accepts a key of any length, so without that check an empty or truncated secret — an unset
environment variable, say — derives keys that look exactly like real ones. Every user of the
application hangs off this one value, so a weak one exposes all of them at once, and nothing about
the keys it produces would show it.

Rotating the secret changes every derived key, and therefore every user's identity. Generate it once
with something like `openssl rand -base64 48` and keep it.
