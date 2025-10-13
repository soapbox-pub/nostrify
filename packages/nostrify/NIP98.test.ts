import { test } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";
import { generateSecretKey } from "nostr-tools";
import { ZodError } from "zod";

import { NIP98 } from "./NIP98.ts";
import { NSecSigner } from "./NSecSigner.ts";
import { N64 } from "./utils/mod.ts";

await test("NIP98.template", async () => {
  const request = new Request("https://example.com");
  const event = await NIP98.template(request);

  deepStrictEqual(event.kind, 27235);
  deepStrictEqual(event.tags, [
    ["method", "GET"],
    ["u", "https://example.com/"],
  ]);
});

await test("NIP98.template with payload", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: "Hello, world!",
  });
  const event = await NIP98.template(request);

  deepStrictEqual(event.kind, 27235);
  deepStrictEqual(event.tags, [
    ["method", "POST"],
    ["u", "https://example.com/"],
    [
      "payload",
      "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3",
    ],
  ]);
});

await test("NIP98.verify", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent(t);

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  const proof = await NIP98.verify(request);

  deepStrictEqual(proof, event);
  deepStrictEqual(proof.pubkey, await signer.getPublicKey());
});

await test("NIP98.verify fails with missing header", async () => {
  const request = new Request("https://example.com");

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Missing Nostr authorization header",
  );
});

await test("NIP98.verify fails with missing token", async () => {
  const request = new Request("https://example.com");
  request.headers.set("authorization", "Nostr");

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Missing Nostr authorization token",
  );
});

await test("NIP98.verify fails with invalid token", async () => {
  const request = new Request("https://example.com");
  request.headers.set("authorization", "Nostr invalid");

  await rejects(
    () => NIP98.verify(request),
    ZodError,
  );
});

await test("NIP98.verify fails with invalid event", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent(t);

  event.sig = "invalid";

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event signature is invalid",
  );
});

await test("NIP98.verify fails with wrong event kind", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent({ ...t, kind: 1 });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event must be kind 27235",
  );
});

await test("NIP98.verify fails with wrong request URL", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent({
    ...t,
    tags: [["u", "https://example.org/"]],
  });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event URL does not match request URL",
  );
});

await test("NIP98.verify fails with wrong request method", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent({
    ...t,
    tags: [["u", "https://example.com/"], ["method", "POST"]],
  });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event method does not match HTTP request method",
  );
});

await test("NIP98.verify fails with expired event", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent({ ...t, created_at: 0 });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event expired",
  );
});

await test("NIP98.verify fails with invalid payload", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com", {
    method: "POST",
    body: "Hello, world!",
  });

  const t = await NIP98.template(request);
  const tags = t.tags.filter(([name]) => name !== "payload");
  const event = await signer.signEvent({
    ...t,
    tags: [...tags, ["payload", "invalid"]],
  });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    Error,
    "Event payload does not match request body",
  );
});
