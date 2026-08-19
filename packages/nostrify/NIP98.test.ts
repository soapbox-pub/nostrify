import { test } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";
import { generateSecretKey } from "nostr-tools";
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
    (e) => e instanceof Error && e.message === "Invalid token",
  );
});

await test("NIP98.verify fails with invalid event", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent(t);

  // Well-formed but wrong, so the token parses and it's the signature check
  // that rejects it.
  event.sig = "f".repeat(128);

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

await test("NIP98.verify fails with a future-dated event", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const request = new Request("https://example.com");

  const t = await NIP98.template(request);
  const event = await signer.signEvent({
    ...t,
    created_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  });

  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    (e) =>
      e instanceof Error && e.message === "Event is dated too far in the future",
  );
});

await test("NIP98.verify fails when a body-bearing request has no payload tag", async () => {
  const signer = new NSecSigner(generateSecretKey());

  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body: "Hello, world!" }),
  );

  const event = await signer.signEvent({
    ...template,
    tags: template.tags.filter(([name]) => name !== "payload"),
  });

  // The token binds only the URL and method, so it authorizes any body at all.
  const request = new Request("https://example.com", {
    method: "POST",
    body: "Goodbye, world!",
  });
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request),
    (e) =>
      e instanceof Error && e.message === "Event is missing the payload tag",
  );
});

await test("NIP98.verify accepts a missing payload tag when validatePayload is off", async () => {
  const signer = new NSecSigner(generateSecretKey());

  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body: "Hello, world!" }),
  );

  const event = await signer.signEvent({
    ...template,
    tags: template.tags.filter(([name]) => name !== "payload"),
  });

  const request = new Request("https://example.com", {
    method: "POST",
    body: "Hello, world!",
  });
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  const proof = await NIP98.verify(request, { validatePayload: false });

  deepStrictEqual(proof, event);
});

await test("NIP98.verify accepts a body within maxPayloadSize", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const body = "Hello, world!";

  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body }),
  );
  const event = await signer.signEvent(template);

  const request = new Request("https://example.com", { method: "POST", body });
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  const proof = await NIP98.verify(request, { maxPayloadSize: 1024 });

  deepStrictEqual(proof, event);
});

await test("NIP98.verify refuses to hold a body over maxPayloadSize", async () => {
  const signer = new NSecSigner(generateSecretKey());
  const body = "x".repeat(4096);

  // A valid signature costs an attacker nothing — this token is signed by a
  // throwaway key and would still be rejected on authorization grounds. It gets
  // far enough to be hashed, which is the point.
  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body }),
  );
  const event = await signer.signEvent(template);

  const request = new Request("https://example.com", { method: "POST", body });
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request, { maxPayloadSize: 1024 }),
    (e) =>
      e instanceof Error && e.message === "Request body is too large to verify",
  );
});

await test("NIP98.verify enforces maxPayloadSize without a content-length", async () => {
  const signer = new NSecSigner(generateSecretKey());

  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body: "x" }),
  );
  const event = await signer.signEvent(template);

  // A streamed body carries no content-length, so the header shortcut can't
  // turn it away and the running total has to.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 8; i++) {
        controller.enqueue(new Uint8Array(512));
      }
      controller.close();
    },
  });

  const request = new Request("https://example.com", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  deepStrictEqual(request.headers.get("content-length"), null);

  await rejects(
    () => NIP98.verify(request, { maxPayloadSize: 1024 }),
    (e) =>
      e instanceof Error && e.message === "Request body is too large to verify",
  );
});

await test("NIP98.verify checks a payload tag it wasn't required to check", async () => {
  const signer = new NSecSigner(generateSecretKey());

  const template = await NIP98.template(
    new Request("https://example.com", { method: "POST", body: "Hello, world!" }),
  );

  const event = await signer.signEvent(template);

  const request = new Request("https://example.com", {
    method: "POST",
    body: "Goodbye, world!",
  });
  request.headers.set("authorization", `Nostr ${N64.encodeEvent(event)}`);

  await rejects(
    () => NIP98.verify(request, { validatePayload: false }),
    (e) =>
      e instanceof Error &&
      e.message === "Event payload does not match request body",
  );
});
