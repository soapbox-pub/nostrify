import { test } from "node:test";
import type { NostrConnectResponse } from "@nostrify/types";
import { deepStrictEqual, ok } from "node:assert";
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
