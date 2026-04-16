import { test } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { NSchema as n } from "./NSchema.ts";

import nostrEvent from "../../fixtures/event-1.json" with { type: "json" };

await test("n.id", () => {
  ok(n.id().safeParse(nostrEvent.id).success);
  ok(n.id().safeParse(nostrEvent.pubkey).success);

  ok(!n.id().safeParse("abc").success);
  ok(!n.id().safeParse(nostrEvent.pubkey.slice(0, -1)).success);
});

await test("n.bech32", () => {
  ok(
    n.bech32("npub").safeParse(
      "npub108pv4cg5ag52nq082kd5leu9ffrn2gdg6g4xdwatn73y36uzplmq9uyev6",
    ).success,
  );
  ok(
    n.bech32().safeParse(
      "lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu",
    )
      .success,
  );

  ok(!n.bech32().safeParse("abc").success);
  ok(
    !n.bech32().safeParse(
      "lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu" +
        "_",
    ).success,
  );

  // Prefix mismatch surfaces a helpful error message.
  const mismatch = n.bech32("npub").safeParse(
    "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5",
  );
  ok(!mismatch.success);
  ok(
    mismatch.error!.issues.some((issue) =>
      typeof issue.message === "string" &&
      issue.message.includes('Expected bech32 prefix "npub1"')
    ),
  );
});

await test("n.filter", () => {
  ok(n.filter().safeParse({}).success);
  ok(n.filter().safeParse({ kinds: [0] }).success);
  ok(n.filter().safeParse({ ids: [nostrEvent.id] }).success);
  ok(n.filter().safeParse({ authors: [nostrEvent.pubkey] }).success);
  ok(n.filter().safeParse({ kinds: [1], "#t": ["nostrasia"] }).success);
  ok(n.filter().safeParse({ "#t": ["yolo"] }).success);

  // Known keys and tag filters pass through unchanged.
  deepStrictEqual(
    n.filter().parse({
      kinds: [1],
      "#t": ["nostrasia"],
    }),
    { kinds: [1], "#t": ["nostrasia"] },
  );

  // Unknown top-level keys are rejected (strict behavior).
  ok(
    !n.filter().safeParse({
      kinds: [1],
      "#t": ["nostrasia"],
      seenOn: ["wss://relay.mostr.pub/"],
    }).success,
  );
  ok(!n.filter().safeParse({ foo: "bar" }).success);

  // Multi-character "#"-prefixed tag filters (e.g. "#unique") are allowed
  // because custom tag names are used in practice.
  ok(n.filter().safeParse({ "#unique": ["x"] }).success);
  // A bare "#" alone is not a valid tag filter.
  ok(!n.filter().safeParse({ "#": ["x"] }).success);

  ok(!n.filter().safeParse({ kinds: [0.5] }).success);
  ok(!n.filter().safeParse({ ids: ["abc"] }).success);
  ok(!n.filter().safeParse({ authors: ["abc"] }).success);

  // Kind upper bound (0–65535 per NostrEvent.kind docs).
  ok(!n.filter().safeParse({ kinds: [65536] }).success);
  ok(n.filter().safeParse({ kinds: [65535] }).success);
});

await test("n.event", () => {
  ok(n.event().safeParse(nostrEvent).success);

  deepStrictEqual(
    n.event().parse(nostrEvent),
    {
      id: nostrEvent.id,
      kind: nostrEvent.kind,
      pubkey: nostrEvent.pubkey,
      tags: nostrEvent.tags,
      content: nostrEvent.content,
      created_at: nostrEvent.created_at,
      sig: nostrEvent.sig,
    },
  );

  ok(!n.event().safeParse({}).success);
  ok(!n.event().safeParse({ id: "abc" }).success);
  ok(!n.event().safeParse({ kind: 0.5 }).success);
  ok(!n.event().safeParse({ pubkey: "abc" }).success);
  ok(!n.event().safeParse({ tags: ["abc"] }).success);
  ok(!n.event().safeParse({ content: 1 }).success);
  ok(!n.event().safeParse({ created_at: -1 }).success);
  ok(!n.event().safeParse({ sig: "abc" }).success);

  // Kind upper bound (0–65535).
  ok(!n.event().safeParse({ ...nostrEvent, kind: 65536 }).success);
  ok(n.event().safeParse({ ...nostrEvent, kind: 65535 }).success);
});

await test("n.relayInfo - accepts NIP-11 spec fields", () => {
  // Based on the canonical NIP-11 nostr.wine example document.
  const info = n.relayInfo().parse({
    contact: "wino@nostr.wine",
    description: "A paid nostr relay for wine enthusiasts and everyone else.",
    banner: "https://example.com/banner.png",
    self: "4918eb332a41b71ba9a74b1dc64276cfff592e55107b93baae38af3520e55975",
    terms_of_service: "https://nostr.wine/terms",
    fees: {
      admission: [{ amount: 18888000, unit: "msats" }],
    },
    limitation: {
      default_limit: 500,
      max_limit: 1000,
    },
  });

  deepStrictEqual(info.banner, "https://example.com/banner.png");
  deepStrictEqual(
    info.self,
    "4918eb332a41b71ba9a74b1dc64276cfff592e55107b93baae38af3520e55975",
  );
  deepStrictEqual(info.terms_of_service, "https://nostr.wine/terms");
  deepStrictEqual(info.limitation?.default_limit, 500);
});

await test("n.relayInfo - malformed retention/fees drops to undefined", () => {
  // A malformed inner entry invalidates the whole list, which then falls
  // back to undefined via the outer .catch(undefined). This preserves the
  // rest of the document instead of rejecting the entire NIP-11 doc.
  const info = n.relayInfo().parse({
    name: "Example",
    retention: [
      { time: 3600 },
      { time: "not a number" },
    ],
    fees: {
      admission: [
        { amount: "nope", unit: "sats" },
      ],
    },
  });

  ok(info.name === "Example");
  ok(info.retention === undefined);
  ok(info.fees === undefined);
});

await test("n.metadata", () => {
  // Passing
  deepStrictEqual(n.metadata().parse({ name: "Alex" }).name, "Alex");
  deepStrictEqual(
    n.metadata().parse({ about: "I am a developer." }).about,
    "I am a developer.",
  );
  deepStrictEqual(
    n.metadata().parse({ picture: "https://nostrify.dev/1.png" }).picture,
    "https://nostrify.dev/1.png",
  );
  deepStrictEqual(
    n.metadata().parse({ banner: "https://nostrify.dev/2.png" }).banner,
    "https://nostrify.dev/2.png",
  );
  deepStrictEqual(
    n.metadata().parse({ nip05: "alex@gleasonator.dev" }).nip05,
    "alex@gleasonator.dev",
  );
  deepStrictEqual(
    n.metadata().parse({ lud06: "lnurl1acdacd" }).lud06,
    "lnurl1acdacd",
  );
  deepStrictEqual(
    n.metadata().parse({ lud16: "alex@alexgleason.me" }).lud16,
    "alex@alexgleason.me",
  );
  deepStrictEqual(
    n.metadata().parse({ website: "https://nostrify.dev" }).website,
    "https://nostrify.dev",
  );

  // Failing
  deepStrictEqual(n.metadata().parse({ name: 1 }).name, undefined);
  deepStrictEqual(n.metadata().parse({ about: 1 }).about, undefined);
  deepStrictEqual(n.metadata().parse({ picture: "abc" }).picture, undefined);
  deepStrictEqual(n.metadata().parse({ banner: "abc" }).banner, undefined);
  deepStrictEqual(
    n.metadata().parse({ nip05: "nostrify.dev" }).nip05,
    undefined,
  );
  deepStrictEqual(n.metadata().parse({ lud06: "npub1abc" }).lud06, undefined);
  deepStrictEqual(
    n.metadata().parse({ lud16: "nostrify.dev" }).lud16,
    undefined,
  );
  deepStrictEqual(
    n.metadata().parse({ website: "nostrify.dev" }).website,
    undefined,
  );
});
