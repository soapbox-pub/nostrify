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

await test("NConnectSigner.signEvent ignores a response from the wrong author", async () => {
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
      // pubkey, answering in the signer's stead. It carries the right request
      // id and decrypts cleanly; the author is what gives it away.
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

/**
 * Answer the next request the client sends with `result`, authored by `remote`.
 * `MockRelay` is an `NSet`, so the request is replayed to this subscription
 * whether it was published before or after the call.
 */
async function respondOnce(
  relay: MockRelay,
  remote: NSecSigner,
  result: string,
): Promise<void> {
  const pubkey = await remote.getPublicKey();

  for await (const msg of relay.req([{ kinds: [24133], "#p": [pubkey] }])) {
    if (msg[0] !== "EVENT") continue;

    const event = msg[2];
    const decrypted = await remote.nip44!.decrypt(event.pubkey, event.content);
    const request = n.json().pipe(n.connectRequest()).parse(decrypted);

    await relay.event(
      await remote.signEvent({
        kind: 24133,
        content: await remote.nip44!.encrypt(
          event.pubkey,
          JSON.stringify({ id: request.id, result }),
        ),
        tags: [["p", event.pubkey]],
        created_at: Math.floor(Date.now() / 1000),
      }),
    );

    return;
  }
}

/** Build a signer whose next request is answered with `result`. */
async function connectWith(
  result: string,
): Promise<{ connect: NConnectSigner; responded: Promise<void> }> {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());

  const connect = new NConnectSigner({
    relay,
    pubkey: await remote.getPublicKey(),
    signer: new NSecSigner(generateSecretKey()),
    timeout: 5_000,
  });

  return { connect, responded: respondOnce(relay, remote, result) };
}

await test("NConnectSigner.getPublicKey returns the signer's pubkey", async () => {
  const pubkey = "e".repeat(64);
  const { connect, responded } = await connectWith(pubkey);

  const promise = connect.getPublicKey();
  await responded;

  deepStrictEqual(await promise, pubkey);
});

await test("NConnectSigner.getPublicKey rejects a result that isn't a pubkey", async () => {
  // This value becomes the identity the application signs in as, so an `npub`,
  // an empty string, or an uppercased pubkey are all rejected rather than
  // adopted and left to fail somewhere further on.
  for (
    const result of [
      "",
      "ack",
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      "E".repeat(64),
      "e".repeat(63),
      "e".repeat(65),
    ]
  ) {
    const { connect, responded } = await connectWith(result);

    const promise = connect.getPublicKey();
    await responded;

    await rejects(() => promise, `expected ${JSON.stringify(result)} to be rejected`);
  }
});

await test("NConnectSigner.connect accepts an ack", async () => {
  const { connect, responded } = await connectWith("ack");

  const promise = connect.connect();
  await responded;

  deepStrictEqual(await promise, "ack");
});

await test("NConnectSigner.connect accepts the secret it sent", async () => {
  // NIP-46 lets the signer answer a secret-bearing `connect` with either `ack`
  // or the secret itself, so both have to pass.
  const { connect, responded } = await connectWith("hunter2");

  const promise = connect.connect("hunter2");
  await responded;

  deepStrictEqual(await promise, "hunter2");
});

await test("NConnectSigner.connect rejects anything else", async () => {
  for (const [result, secret] of [["", undefined], ["gotcha", undefined], ["hunter2", "swordfish"]] as const) {
    const { connect, responded } = await connectWith(result);

    const promise = connect.connect(secret);
    await responded;

    await rejects(
      () => promise,
      (e: unknown) =>
        e instanceof Error &&
        e.message === "Remote signer did not acknowledge the connection",
      `expected ${JSON.stringify(result)} to be rejected`,
    );
  }
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

await test("NConnectSigner.signEvent rejects a response it can't read", async () => {
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

      // Only the remote signer can author an event the client accepts, so
      // garbage under its key is that signer failing rather than a stranger
      // interfering. Fail the request instead of waiting out the timeout.
      await relay.event(
        await remote.signEvent({
          kind: 24133,
          content: "not encrypted to anybody",
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
      e.message === "Failed to read the response from the remote signer",
  );
});

await test("NConnectSigner.signEvent reads a nip04 reply to a nip44 request", async () => {
  const relay = new MockRelay();
  const remote = new NSecSigner(generateSecretKey());
  const pubkey = await remote.getPublicKey();

  // NIP-46 lets the signer answer in whichever scheme it likes, so `encryption`
  // governs what this client sends and nothing about what it receives.
  const connect = new NConnectSigner({
    relay,
    pubkey,
    signer: new NSecSigner(generateSecretKey()),
    encryption: "nip44",
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

  const signed = await promise;

  deepStrictEqual(signed.pubkey, pubkey);
  ok(verifyEvent(signed));
});
