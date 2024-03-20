import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

import { NIP50 } from './NIP50.ts';

Deno.test('NIP50.parseInput', () => {
  assertEquals(NIP50.parseInput(''), []);
  assertEquals(NIP50.parseInput(' '), []);
  assertEquals(NIP50.parseInput('hello'), ['hello']);
  assertEquals(NIP50.parseInput('hello world'), ['hello', 'world']);
  assertEquals(NIP50.parseInput('hello "world"'), ['hello', 'world']);
  assertEquals(NIP50.parseInput('hello "world" "hello world"'), [
    'hello',
    'world',
    'hello world',
  ]);
  assertEquals(NIP50.parseInput('domain:gleasonator.dev'), [
    { key: 'domain', value: 'gleasonator.dev' },
  ]);
  assertEquals(NIP50.parseInput('domain:gleasonator.dev '), [
    { key: 'domain', value: 'gleasonator.dev' },
  ]);
  assertEquals(NIP50.parseInput('domain: yolo'), [
    'domain:',
    'yolo',
  ]);
  assertEquals(NIP50.parseInput('domain:localhost:8000'), [
    { key: 'domain', value: 'localhost:8000' },
  ]);
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
