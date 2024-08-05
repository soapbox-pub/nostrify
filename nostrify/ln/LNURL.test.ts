import { assertEquals } from '@std/assert';
import { returnsNext, stub } from '@std/testing/mock';

import { LNURL } from './LNURL.ts';

import lnurlDetails from '../../fixtures/lnurlp.json' with { type: 'json' };
import callback from '../../fixtures/callback.json' with { type: 'json' };

Deno.test('LNURL.lookup', async () => {
  const fetch = stub(
    globalThis,
    'fetch',
    returnsNext([
      Promise.resolve(new Response(JSON.stringify(lnurlDetails))),
    ]),
  );

  const result = await LNURL.lookup(
    'lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu',
    { fetch },
  );

  const expected = {
    allowsNostr: true,
    callback: 'https://getalby.com/lnurlp/alexgleason/callback',
    commentAllowed: 255,
    maxSendable: 100000000,
    minSendable: 1000,
    metadata: '[["text/identifier","alexgleason@getalby.com"],["text/plain","Sats for alexgleason"]]',
    nostrPubkey: '79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432',
    tag: 'payRequest' as const,
  };

  assertEquals(result, expected);
  fetch.restore();
});

Deno.test('LNURL.decode', () => {
  const result = LNURL.decode(
    'lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu',
  );
  assertEquals(result, new URL('https://getalby.com/.well-known/lnurlp/alexgleason'));
});

Deno.test('LNURL.encode', () => {
  const result = LNURL.encode('https://getalby.com/.well-known/lnurlp/alexgleason');
  assertEquals(result, 'lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd3jhsemvv4shxmmw5uhvxu');
});

Deno.test('LNURL.callback', async () => {
  const fetch = stub(
    globalThis,
    'fetch',
    returnsNext([
      Promise.resolve(new Response(JSON.stringify(callback))),
    ]),
  );

  const url = 'https://getalby.com/lnurlp/alexgleason/callback';
  const result = await LNURL.callback(url, { amount: 1000 }, { fetch });

  const expected = {
    pr:
      'lnbc10n1pj6a3pmpp54wsjl3nscygnfsf6uy08cnlf94t64a7cr0pt3t6nmdzm4kq8x6yshp5nf3ugrnz5d5fc5avnrzu8m9ae3e7p4v82cyhtf425dmtv8fn755qcqzzsxqyz5vqsp5m9d6yrj9mu5wwk3kxfdn4hwwmztdjqvdc3z5402gwdc6janx4ltq9qyyssq36wz68vj35pr39e8hkq0ldfauglqfsfyw9u0u4v4dmy7hvg20244jm69ja4g0cmwzxxgmzrqqsgeenxzmsqwhpfrzk7dvezd60u0qcqpd6nhs7',
    routes: [],
  };

  assertEquals(result, expected);
  fetch.restore();
});
