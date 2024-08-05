import { NSet } from './NSet.ts';

const set = new NSet();
let id = 0;

Deno.bench('NSet.add', () => {
  set.add(
    { id: `${++id}`, kind: 1, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] },
  );
});
