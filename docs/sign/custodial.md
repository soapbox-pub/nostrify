# Custodial Signer

The [`NCustodial`](https://jsr.io/@nostrify/nostrify/doc/~/NCustodial) class is useful for custodial auth where you want to manage one secret for the entire application.

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