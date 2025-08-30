import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

import { LNURL } from "@nostrify/nostrify/ln";

// deno-lint-ignore require-await
const mockFetch: typeof globalThis.fetch = async (input, init) => {
  const { url } = new Request(input, init);
  switch (url) {
    case "https://getalby.com/.well-known/lnurlp/alexgleason":
      return new Response(JSON.stringify({
        status: "OK",
        tag: "payRequest",
        commentAllowed: 255,
        callback: "https://getalby.com/lnurlp/alexgleason/callback",
        metadata:
          '[["text/identifier","alexgleason@getalby.com"],["text/plain","Sats for alexgleason"]]',
        minSendable: 1000,
        maxSendable: 100000000,
        payerData: {
          name: { mandatory: false },
          email: { mandatory: false },
          pubkey: { mandatory: false },
        },
        nostrPubkey:
          "79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432",
        allowsNostr: true,
      }));
    case "https://getalby.com/lnurlp/alexgleason/callback?amount=1000&lnurl=lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu":
      return new Response(JSON.stringify({
        status: "OK",
        successAction: { tag: "message", message: "Thanks, sats received!" },
        verify:
          "https://getalby.com/lnurlp/alexgleason/verify/sMgdHth68xnS5H1tJtL4kh3T",
        routes: [],
        pr:
          "lnbc10n1pj6a3pmpp54wsjl3nscygnfsf6uy08cnlf94t64a7cr0pt3t6nmdzm4kq8x6yshp5nf3ugrnz5d5fc5avnrzu8m9ae3e7p4v82cyhtf425dmtv8fn755qcqzzsxqyz5vqsp5m9d6yrj9mu5wwk3kxfdn4hwwmztdjqvdc3z5402gwdc6janx4ltq9qyyssq36wz68vj35pr39e8hkq0ldfauglqfsfyw9u0u4v4dmy7hvg20244jm69ja4g0cmwzxxgmzrqqsgeenxzmsqwhpfrzk7dvezd60u0qcqpd6nhs7",
      }));
    default:
      throw new Error(`Unexpected URL: ${url}`);
  }
};

await test("LNURL.fromString", () => {
  const lnurl = LNURL.fromString(
    "lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu",
  );
  deepStrictEqual(
    lnurl.url.toString(),
    "https://getalby.com/.well-known/lnurlp/alexgleason",
  );
});

await test("LNURL.fromLightningAddress", () => {
  const lnurl = LNURL.fromLightningAddress("alexgleason@getalby.com");
  deepStrictEqual(
    lnurl.url.toString(),
    "https://getalby.com/.well-known/lnurlp/alexgleason",
  );
});

await test("LNURL.toString", () => {
  const lnurl = new LNURL(
    new URL("https://getalby.com/.well-known/lnurlp/alexgleason"),
  );
  deepStrictEqual(
    lnurl.toString(),
    "lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu",
  );
});

await test("LNURL.getDetails", async () => {
  const lnurl = new LNURL(
    new URL("https://getalby.com/.well-known/lnurlp/alexgleason"),
    { fetch: mockFetch },
  );
  const details = await lnurl.getDetails();

  deepStrictEqual(details, {
    tag: "payRequest",
    commentAllowed: 255,
    callback: "https://getalby.com/lnurlp/alexgleason/callback",
    metadata:
      '[["text/identifier","alexgleason@getalby.com"],["text/plain","Sats for alexgleason"]]',
    minSendable: 1000,
    maxSendable: 100000000,
    nostrPubkey:
      "79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432",
    allowsNostr: true,
  });
});

await test("LNURL.getInvoice", async () => {
  const lnurl = new LNURL(
    new URL("https://getalby.com/.well-known/lnurlp/alexgleason"),
    { fetch: mockFetch },
  );
  const invoice = await lnurl.getInvoice({ amount: 1000 });

  deepStrictEqual(invoice, {
    pr:
      "lnbc10n1pj6a3pmpp54wsjl3nscygnfsf6uy08cnlf94t64a7cr0pt3t6nmdzm4kq8x6yshp5nf3ugrnz5d5fc5avnrzu8m9ae3e7p4v82cyhtf425dmtv8fn755qcqzzsxqyz5vqsp5m9d6yrj9mu5wwk3kxfdn4hwwmztdjqvdc3z5402gwdc6janx4ltq9qyyssq36wz68vj35pr39e8hkq0ldfauglqfsfyw9u0u4v4dmy7hvg20244jm69ja4g0cmwzxxgmzrqqsgeenxzmsqwhpfrzk7dvezd60u0qcqpd6nhs7",
    routes: [],
  });
});
