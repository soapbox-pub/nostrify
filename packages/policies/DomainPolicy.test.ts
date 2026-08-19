import { test } from "node:test";
import { genEvent, MockRelay } from "@nostrify/nostrify/test";
import type { NostrMetadata } from "@nostrify/types";
import { deepStrictEqual } from "node:assert";
import { generateSecretKey, getPublicKey } from "nostr-tools";

import { DomainPolicy } from "./DomainPolicy.ts";

await test("DomainPolicy allows events from authors with a valid nip05", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "alex@gleasonator.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
  });

  const metadata: NostrMetadata = { nip05: "alex@gleasonator.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, ["OK", event.id, true, ""]);
});

await test("DomainPolicy rejects events from authors without a kind 0", async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);
  const event = genEvent({ kind: 1, content: "hello world" });

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: author is missing a kind 0 event",
  ]);
});

await test("DomainPolicy rejects events from authors with a missing nip05", async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);

  const sk = generateSecretKey();
  const metadata: NostrMetadata = {};
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, ["OK", event.id, false, "blocked: missing nip05"]);
});

await test("DomainPolicy rejects events from authors with a malformed nip05", async () => {
  const store = new MockRelay();
  const policy = new DomainPolicy(store);

  const sk = generateSecretKey();
  const metadata: NostrMetadata = { nip05: "asdf" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, ["OK", event.id, false, "blocked: missing nip05"]);
});

await test("DomainPolicy rejects events from authors with an invalid nip05", async () => {
  const store = new MockRelay();

  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(_nip05: string) {
      const pubkey = getPublicKey(generateSecretKey());
      return { pubkey };
    },
  });

  const metadata: NostrMetadata = { nip05: "alex@gleasonator.dev" };
  const sk = generateSecretKey();
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: mismatched nip05 pubkey",
  ]);
});

await test("DomainPolicy rejects events from authors with a blacklisted nip05 domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "bot@replyguy.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    blacklist: ["replyguy.dev"],
  });

  const metadata: NostrMetadata = { nip05: "bot@replyguy.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: blacklisted nip05 domain",
  ]);
});

await test("DomainPolicy rejects events from authors who aren't on a whitelisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "bot@replyguy.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    whitelist: ["gleasonator.dev"],
  });

  const metadata: NostrMetadata = { nip05: "bot@replyguy.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: nip05 domain not in whitelist",
  ]);
});

await test("DomainPolicy allows events from authors who are on a whitelisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "alex@gleasonator.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    whitelist: ["gleasonator.dev"],
  });

  const metadata: NostrMetadata = { nip05: "alex@gleasonator.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, ["OK", event.id, true, ""]);
});

await test("DomainPolicy rejects events from authors with a subdomain of a blacklisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "bot@spam.replyguy.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    blacklist: ["replyguy.dev"],
  });

  const metadata: NostrMetadata = { nip05: "bot@spam.replyguy.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: blacklisted nip05 domain",
  ]);
});

await test("DomainPolicy rejects events from authors with a deeply nested subdomain of a blacklisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "user@deep.nested.spam.replyguy.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    blacklist: ["replyguy.dev"],
  });

  const metadata: NostrMetadata = {
    nip05: "user@deep.nested.spam.replyguy.dev",
  };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, [
    "OK",
    event.id,
    false,
    "blocked: blacklisted nip05 domain",
  ]);
});

await test("DomainPolicy allows events from authors with similar but not subdomain of blacklisted domain", async () => {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const store = new MockRelay();
  const policy = new DomainPolicy(store, {
    // deno-lint-ignore require-await
    async lookup(nip05: string) {
      if (nip05 === "user@notreplyguy.dev") {
        return { pubkey };
      } else {
        throw new Error("not found");
      }
    },
    blacklist: ["replyguy.dev"],
  });

  const metadata: NostrMetadata = { nip05: "user@notreplyguy.dev" };
  await store.event(
    genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
  );
  const event = genEvent({ kind: 1, content: "hello world" }, sk);

  const result = await policy.call(event);

  deepStrictEqual(result, ["OK", event.id, true, ""]);
});

await test("DomainPolicy blacklists a domain regardless of case", async () => {
  for (const nip05 of ["bot@REPLYGUY.dev", "bot@Spam.ReplyGuy.dev"]) {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);

    const store = new MockRelay();
    const policy = new DomainPolicy(store, {
      // deno-lint-ignore require-await
      async lookup(_nip05: string) {
        return { pubkey };
      },
      // The list entry is normalized too, so an operator's stray capital or
      // trailing dot doesn't silently disable the entry.
      blacklist: ["ReplyGuy.dev."],
    });

    const metadata: NostrMetadata = { nip05 };
    await store.event(
      genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
    );
    const event = genEvent({ kind: 1, content: "hello world" }, sk);

    deepStrictEqual(await policy.call(event), [
      "OK",
      event.id,
      false,
      "blocked: blacklisted nip05 domain",
    ]);
  }
});

await test("DomainPolicy whitelists a domain regardless of case", async () => {
  for (const nip05 of ["alex@Gleasonator.dev", "alex@GLEASONATOR.DEV"]) {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);

    const store = new MockRelay();
    const policy = new DomainPolicy(store, {
      // deno-lint-ignore require-await
      async lookup(_nip05: string) {
        return { pubkey };
      },
      whitelist: ["Gleasonator.dev."],
    });

    const metadata: NostrMetadata = { nip05 };
    await store.event(
      genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
    );
    const event = genEvent({ kind: 1, content: "hello world" }, sk);

    deepStrictEqual(await policy.call(event), ["OK", event.id, true, ""]);
  }
});

await test("DomainPolicy doesn't look up a domain it has already rejected", async () => {
  for (
    const opts of [
      { blacklist: ["replyguy.dev"] },
      { whitelist: ["gleasonator.dev"] },
    ]
  ) {
    const sk = generateSecretKey();
    let looked = false;

    const store = new MockRelay();
    const policy = new DomainPolicy(store, {
      ...opts,
      // deno-lint-ignore require-await
      async lookup(_nip05: string) {
        looked = true;
        return { pubkey: getPublicKey(sk) };
      },
    });

    const metadata: NostrMetadata = { nip05: "bot@replyguy.dev" };
    await store.event(
      genEvent({ kind: 0, content: JSON.stringify(metadata) }, sk),
    );
    const event = genEvent({ kind: 1, content: "hello world" }, sk);

    deepStrictEqual((await policy.call(event))[2], false);
    deepStrictEqual(looked, false);
  }
});
