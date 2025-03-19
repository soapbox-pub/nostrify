/// <reference lib="dom" />

import { assertEquals } from '@std/assert';
import { render } from '@testing-library/react';

import { NostrProvider } from './nostr-context.tsx';
import { polyfillWindow } from './test-setup.ts';

polyfillWindow();

Deno.test('NostrProvider', () => {
  const screen = render(
    <NostrProvider>
      <p>Hello world!</p>
    </NostrProvider>,
  );

  const element = screen.getByRole('paragraph');
  assertEquals(element.innerHTML, 'Hello world!');
});
