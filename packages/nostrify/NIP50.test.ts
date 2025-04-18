import { assertEquals } from '@std/assert';

import { NIP50 } from './NIP50.ts';

Deno.test('NIP50.parseInput', () => {
  assertEquals(NIP50.parseInput(''), []);
  assertEquals(NIP50.parseInput(' '), []);
  assertEquals(NIP50.parseInput('hello'), ['hello']);
  assertEquals(NIP50.parseInput('hello world'), ['hello', 'world']);
  assertEquals(NIP50.parseInput('hello  "world"'), ['hello', 'world']);

  assertEquals(
    NIP50.parseInput('hello "world" "hello world"'),
    ['hello', 'world', 'hello world'],
  );

  assertEquals(
    NIP50.parseInput('domain:gleasonator.dev'),
    [{ key: 'domain', value: 'gleasonator.dev' }],
  );

  assertEquals(
    NIP50.parseInput('domain: yolo'),
    ['domain:', 'yolo'],
  );

  assertEquals(
    NIP50.parseInput('domain:localhost:8000'),
    [{ key: 'domain', value: 'localhost:8000' }],
  );

  assertEquals(
    NIP50.parseInput('name:John "New York" age:30 hobbies:programming'),
    [
      { key: 'name', value: 'John' },
      'New York',
      { key: 'age', value: '30' },
      { key: 'hobbies', value: 'programming' },
    ],
  );
});

Deno.test('NIP50.parseInput with negated token', () => {
  assertEquals(
    NIP50.parseInput('-reply:true'),
    [{ key: '-reply', value: 'true' }],
  );

  assertEquals(
    NIP50.parseInput('hello -reply:true'),
    ['hello', { key: '-reply', value: 'true' }],
  );

  assertEquals(
    NIP50.parseInput('-media:true -reply:true'),
    [{ key: '-media', value: 'true' }, { key: '-reply', value: 'true' }],
  );
});
