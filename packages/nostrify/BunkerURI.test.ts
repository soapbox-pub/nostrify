import { test } from "node:test";
import { deepStrictEqual, throws } from "node:assert";

import { BunkerURI } from "./BunkerURI.ts";

await test("BunkerURI", () => {
  const uri = new BunkerURI(
    "bunker://79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798?relay=wss%3A%2F%2Fditto.pub%2Frelay&secret=piAuZsxgKlil",
  );

  deepStrictEqual({
    pubkey: uri.pubkey,
    relays: uri.relays,
    secret: uri.secret,
  }, {
    pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    relays: ["wss://ditto.pub/relay"],
    secret: "piAuZsxgKlil",
  });
});

await test("BunkerURI.fromJSON", () => {
  const result = BunkerURI.fromJSON({
    pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    relays: ["wss://ditto.pub/relay"],
    secret: "piAuZsxgKlil",
  });

  const expected =
    "bunker://79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798?relay=wss%3A%2F%2Fditto.pub%2Frelay&secret=piAuZsxgKlil";

  deepStrictEqual(result.toString(), expected);
});

await test("BunkerURI rejects a URI that names no signer", () => {
  const pubkey = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

  // The pubkey is the counterparty of every exchange on the connection.
  throws(() => new BunkerURI("bunker://not-a-pubkey?relay=wss%3A%2F%2Fditto.pub%2Frelay"));
  throws(() => new BunkerURI(`bunker://${pubkey.slice(0, 63)}`));
  throws(() => new BunkerURI(`nostrconnect://${pubkey}`));

  // A relay URL that isn't one would be opened as a WebSocket.
  throws(() => new BunkerURI(`bunker://${pubkey}?relay=https%3A%2F%2Fditto.pub`));

  // Hex is hex, whatever case it arrives in.
  deepStrictEqual(
    new BunkerURI(`bunker://${pubkey.toUpperCase()}`).pubkey,
    pubkey,
  );
});
