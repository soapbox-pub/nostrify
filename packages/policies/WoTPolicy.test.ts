import { test } from "node:test";
import { ErrorRelay, genEvent, MockRelay } from "@nostrify/nostrify/test";
import { ok } from "node:assert";
import { generateSecretKey, getPublicKey } from "nostr-tools";

import { WoTPolicy } from "./WoTPolicy.ts";

function keygen(): { pubkey: string; seckey: Uint8Array } {
  const seckey = generateSecretKey();
  const pubkey = getPublicKey(seckey);
  return { pubkey, seckey };
}

await test("WoTPolicy", async () => {
  const store = new MockRelay();
  try {
    const [alex, patrick, fiatjaf, replyguy] = [
      keygen(),
      keygen(),
      keygen(),
      keygen(),
    ];

    await store.event(
      genEvent({ kind: 3, tags: [["p", patrick.pubkey]] }, alex.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", fiatjaf.pubkey]] }, patrick.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", patrick.pubkey]] }, fiatjaf.seckey),
    );

    const policy = new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 2 });

    ok((await policy.call(genEvent({}, alex.seckey)))[2]);
    ok((await policy.call(genEvent({}, patrick.seckey)))[2]);
    ok((await policy.call(genEvent({}, fiatjaf.seckey)))[2]);
    ok(!(await policy.call(genEvent({}, replyguy.seckey)))[2]);
  } finally {
    await store.close();
  }
});

await test("WoTPolicy quorum: blocks pubkeys followed by fewer than quorum members", async () => {
  const store = new MockRelay();
  try {
    // alex (seed) follows bob and carol
    // bob follows dave and eve
    // carol follows dave (but not eve)
    // dave is followed by both bob and carol (2 followers in the greater WoT) → quorum met
    // eve is followed only by bob (1 follower in the greater WoT) → quorum not met
    // bob and carol are each followed only by alex (1 follower) → quorum not met
    const [alex, bob, carol, dave, eve] = [
      keygen(),
      keygen(),
      keygen(),
      keygen(),
      keygen(),
    ];

    await store.event(
      genEvent({ kind: 3, tags: [["p", bob.pubkey], ["p", carol.pubkey]] }, alex.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", dave.pubkey], ["p", eve.pubkey]] }, bob.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", dave.pubkey]] }, carol.seckey),
    );

    const policy = new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 2, quorum: 2 });

    ok((await policy.call(genEvent({}, alex.seckey)))[2], "seed pubkey always trusted");
    ok(!(await policy.call(genEvent({}, bob.seckey)))[2], "bob has only 1 follower (alex), quorum=2 not met");
    ok(!(await policy.call(genEvent({}, carol.seckey)))[2], "carol has only 1 follower (alex), quorum=2 not met");
    ok((await policy.call(genEvent({}, dave.seckey)))[2], "dave is followed by bob and carol (quorum=2 met)");
    ok(!(await policy.call(genEvent({}, eve.seckey)))[2], "eve is followed only by bob (quorum=2 not met)");
  } finally {
    await store.close();
  }
});

await test("WoTPolicy quorum=1 behaves like no quorum", async () => {
  const store = new MockRelay();
  try {
    const [alex, bob, carol] = [keygen(), keygen(), keygen()];

    await store.event(
      genEvent({ kind: 3, tags: [["p", bob.pubkey]] }, alex.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", carol.pubkey]] }, bob.seckey),
    );

    const policy = new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 2, quorum: 1 });

    ok((await policy.call(genEvent({}, alex.seckey)))[2]);
    ok((await policy.call(genEvent({}, bob.seckey)))[2]);
    ok((await policy.call(genEvent({}, carol.seckey)))[2]);
  } finally {
    await store.close();
  }
});

await test("WoTPolicy quorum: seed pubkeys always trusted regardless of quorum", async () => {
  const store = new MockRelay();
  try {
    const [alice, bob] = [keygen(), keygen()];

    // alice is a seed but nobody in the graph follows her back
    // bob is not in the graph at all

    const policy = new WoTPolicy({ store, pubkeys: [alice.pubkey], depth: 2, quorum: 5 });

    ok((await policy.call(genEvent({}, alice.seckey)))[2], "seed always trusted");
    ok(!(await policy.call(genEvent({}, bob.seckey)))[2], "unknown pubkey blocked");
  } finally {
    await store.close();
  }
});

await test("WoTPolicy constructor with error store", async () => {
  const store = new ErrorRelay();
  try {
    const alex = keygen();

    // Ensure this doesn't result in an unhandled promise rejection.
    new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 1 });
  } catch {
    // Expected, ErrorRelay throws errors intentionally
  } finally {
    try {
      await store.close();
    } catch {
      // Expected, ErrorRelay.close() throws an error intentionally
    }
  }
});
