import { test } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";
import sinon from "sinon";

import { NIP05 } from "./NIP05.ts";

await test("NIP05.lookup", async () => {
  const { default: nostrJson } = await import("../../fixtures/nostr.json", {
    with: { type: "json" },
  });

  const fetchStub = sinon.stub(globalThis, "fetch");
  fetchStub.resolves(new Response(JSON.stringify(nostrJson)));

  const result = await NIP05.lookup("alex_at_gleasonator.com@mostr.pub", {
    fetch: fetchStub,
  });

  const expected = {
    pubkey: "79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6",
    relays: ["wss://relay.mostr.pub"],
  };

  deepStrictEqual(result, expected);
  fetchStub.restore();
});

// https://github.com/nostrability/nostrability/issues/143#issuecomment-2565772246
await test("NIP05.lookup with invalid values but valid profile pointer", async () => {
  const { default: nostrJson } = await import("../../fixtures/lncal.json", {
    with: { type: "json" },
  });

  const fetchStub = sinon.stub(globalThis, "fetch");
  fetchStub.resolves(new Response(JSON.stringify(nostrJson)));

  const result = await NIP05.lookup("elsat@lncal.com", { fetch: fetchStub });

  const expected = {
    pubkey: "17538dc2a62769d09443f18c37cbe358fab5bbf981173542aa7c5ff171ed77c4",
    relays: undefined,
  };

  deepStrictEqual(result, expected);
  fetchStub.restore();
});

await test("NIP05.lookup with invalid document", () => {
  const fetchStub = sinon.stub(globalThis, "fetch");
  fetchStub.onCall(0).resolves(new Response(JSON.stringify({ names: "yolo" })));
  fetchStub.onCall(1).resolves(new Response(JSON.stringify({})));
  fetchStub.onCall(2).resolves(new Response(JSON.stringify([])));

  rejects(() => NIP05.lookup("alex@gleasonator.dev", { fetch: fetchStub }));
  rejects(() => NIP05.lookup("alex@gleasonator.dev", { fetch: fetchStub }));
  rejects(() => NIP05.lookup("alex@gleasonator.dev", { fetch: fetchStub }));

  fetchStub.restore();
});
