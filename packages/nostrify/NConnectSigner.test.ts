import { test } from "node:test";
import type { NostrConnectResponse } from "@nostrify/types";
import { deepStrictEqual, ok, rejects } from "node:assert";
import { generateSecretKey, verifyEvent } from "nostr-tools";

import { MockRelay } from "./test/MockRelay.ts";
import { NConnectSigner } from "./NConnectSigner.ts";
import { NSchema as n } from "./NSchema.ts";
import { NSecSigner } from "./NSecSigner.ts";

await test("NConnectSigner.signEvent with nip04 encryption", async () => {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());
  const pubkey = await remote.getPublicKey();

  const connect = new NConnectSigner({
    relay,
    pubkey,
    signer: new NSecSigner(generateSecretKey()),
    encryption: "nip04",
  });

  const req = relay.req([{ kinds: [24133], "#p": [pubkey] }]);

  const promise = connect.signEvent({
    kind: 1,
    content: "hello world",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });

  for await (const msg of req) {
    if (msg[0] === "EVENT") {
      const event = msg[2];
      const decrypted = await remote.nip04!.decrypt(
        event.pubkey,
        event.content,
      );
      const request = n.json().pipe(n.connectRequest()).parse(decrypted);
      deepStrictEqual(request.method, "sign_event");
      const response: NostrConnectResponse = {
        id: request.id,
        result: JSON.stringify(
          await remote.signEvent(JSON.parse(request.params[0])),
        ),
      };
      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: await remote.nip04!.encrypt(
            event.pubkey,
            JSON.stringify(response),
          ),
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );
      break;
    }
  }

  ok(verifyEvent(await promise));
  deepStrictEqual(relay.subs.size, 0); // cleanup
});

await test("NConnectSigner.signEvent with nip44 encryption", async () => {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());
  const pubkey = await remote.getPublicKey();

  const connect = new NConnectSigner({
    relay,
    pubkey,
    signer: new NSecSigner(generateSecretKey()),
    encryption: "nip44",
  });

  const req = relay.req([{ kinds: [24133], "#p": [pubkey] }]);

  const promise = connect.signEvent({
    kind: 1,
    content: "hello world",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });

  for await (const msg of req) {
    if (msg[0] === "EVENT") {
      const event = msg[2];
      const decrypted = await remote.nip44!.decrypt(
        event.pubkey,
        event.content,
      );
      const request = n.json().pipe(n.connectRequest()).parse(decrypted);
      deepStrictEqual(request.method, "sign_event");
      const response: NostrConnectResponse = {
        id: request.id,
        result: JSON.stringify(
          await remote.signEvent(JSON.parse(request.params[0])),
        ),
      };
      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: await remote.nip44!.encrypt(
            event.pubkey,
            JSON.stringify(response),
          ),
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );
      break;
    }
  }

  ok(verifyEvent(await promise));
  deepStrictEqual(relay.subs.size, 0); // cleanup
});

await test("NConnectSigner.signEvent ignores noise addressed to the client", async () => {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());
  const impostor = new NSecSigner(generateSecretKey());
  const pubkey = await remote.getPublicKey();

  const connect = new NConnectSigner({
    relay,
    pubkey,
    signer: new NSecSigner(generateSecretKey()),
    timeout: 5_000,
  });

  const req = relay.req([{ kinds: [24133], "#p": [pubkey] }]);

  const promise = connect.signEvent({
    kind: 1,
    content: "hello world",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });

  for await (const msg of req) {
    if (msg[0] === "EVENT") {
      const event = msg[2];
      const decrypted = await remote.nip44!.decrypt(
        event.pubkey,
        event.content,
      );
      const request = n.json().pipe(n.connectRequest()).parse(decrypted);

      // Anyone who has seen the REQ can address a kind 24133 to the client
      // pubkey. A response from the wrong author, and a payload that won't
      // decrypt, are both noise — neither may answer or fail the request.
      await relay.event(
        await impostor.signEvent({
          kind: 24133,
          content: await impostor.nip44!.encrypt(
            event.pubkey,
            JSON.stringify({ id: request.id, result: "gotcha" }),
          ),
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );

      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: "not encrypted to anybody",
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );

      const response: NostrConnectResponse = {
        id: request.id,
        result: JSON.stringify(
          await remote.signEvent(JSON.parse(request.params[0])),
        ),
      };

      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: await remote.nip44!.encrypt(
            event.pubkey,
            JSON.stringify(response),
          ),
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );
      break;
    }
  }

  const signed = await promise;

  deepStrictEqual(signed.pubkey, pubkey);
  ok(verifyEvent(signed));
});

await test("NConnectSigner.signEvent rejects an event that isn't signed", async () => {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());
  const pubkey = await remote.getPublicKey();

  const connect = new NConnectSigner({
    relay,
    pubkey,
    signer: new NSecSigner(generateSecretKey()),
    timeout: 5_000,
  });

  const req = relay.req([{ kinds: [24133], "#p": [pubkey] }]);

  const promise = connect.signEvent({
    kind: 1,
    content: "hello world",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });

  for await (const msg of req) {
    if (msg[0] === "EVENT") {
      const event = msg[2];
      const decrypted = await remote.nip44!.decrypt(
        event.pubkey,
        event.content,
      );
      const request = n.json().pipe(n.connectRequest()).parse(decrypted);

      const signed = await remote.signEvent(JSON.parse(request.params[0]));

      const response: NostrConnectResponse = {
        id: request.id,
        // Well-formed, so it parses; the signature is what gives it away.
        result: JSON.stringify({ ...signed, content: "goodbye world" }),
      };

      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: await remote.nip44!.encrypt(
            event.pubkey,
            JSON.stringify(response),
          ),
          tags: [["p", event.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        }),
      );
      break;
    }
  }

  await rejects(
    () => promise,
    (e: unknown) =>
      e instanceof Error &&
      e.message === "Remote signer returned an invalid event",
  );
});
