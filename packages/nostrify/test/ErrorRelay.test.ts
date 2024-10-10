import { genEvent } from '@nostrify/nostrify/test';
import { assertRejects } from '@std/assert';

import { ErrorRelay } from './ErrorRelay.ts';

Deno.test('ErrorRelay', async () => {
  const store = new ErrorRelay();
  await assertRejects(() => store.event(genEvent()));
  await assertRejects(() => store.query([]));
  await assertRejects(() => store.count([]));
  await assertRejects(() => store.remove([]));
  await assertRejects(() => store.close());

  await assertRejects(async () => {
    for await (const _ of store.req([])) {
      // Do nothing.
    }
  });
});
