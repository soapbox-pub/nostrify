import { polyfillDOM } from '@nostrify/react/test';
import { assertEquals } from '@std/assert';
import { render } from '@testing-library/react';

import NostrProvider from './NostrProvider.tsx';

polyfillDOM();

Deno.test('NostrProvider', () => {
  const screen = render(
    <NostrProvider relays={['wss://ditto.pub/relay']}>
      <p>Hello world!</p>
    </NostrProvider>,
  );

  const element = screen.getByRole('paragraph');
  assertEquals(element.innerHTML, 'Hello world!');
});
