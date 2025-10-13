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
});

await test("n.filter", () => {
  ok(n.filter().safeParse({}).success);
  ok(n.filter().safeParse({ kinds: [0] }).success);
  ok(n.filter().safeParse({ ids: [nostrEvent.id] }).success);
  ok(n.filter().safeParse({ authors: [nostrEvent.pubkey] }).success);
  ok(n.filter().safeParse({ kinds: [1], "#t": ["nostrasia"] }).success);
  ok(n.filter().safeParse({ "#t": ["yolo"] }).success);

  deepStrictEqual(
    n.filter().parse({
      kinds: [1],
      "#t": ["nostrasia"],
      seenOn: ["wss://relay.mostr.pub/"],
    }),
    { kinds: [1], "#t": ["nostrasia"] },
  );

  ok(!n.filter().safeParse({ kinds: [0.5] }).success);
  ok(!n.filter().safeParse({ ids: ["abc"] }).success);
  ok(!n.filter().safeParse({ authors: ["abc"] }).success);
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
