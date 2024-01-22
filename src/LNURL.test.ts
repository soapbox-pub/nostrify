import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { returnsNext, stub } from 'https://deno.land/std@0.212.0/testing/mock.ts';

import { LNURL } from './LNURL.ts';
import lnurlDetails from '../fixtures/lnurlp.json' assert { type: 'json' };

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
    maxSendable: 100000000,
    minSendable: 1000,
    metadata: '[["text/identifier","alexgleason@getalby.com"],["text/plain","Sats for alexgleason"]]',
    nostrPubkey: '79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432',
    tag: 'payRequest' as const,
  };

  assertEquals(result, expected);
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
