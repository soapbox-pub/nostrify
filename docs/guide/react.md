# React Integration

Nostrify provides a React integration package to easily incorporate Nostr functionality into your React applications.

## Installation

Install [`@nostrify/react`](https://jsr.io/@nostrify/react) from JSR.

::: code-group

```sh [npm]
npx jsr add @nostrify/react
```

```sh [Deno]
deno add @nostrify/react
```

```sh [yarn]
yarn dlx jsr add @nostrify/react
```

```sh [pnpm]
pnpm dlx jsr add @nostrify/react
```

```sh [Bun]
bunx jsr add @nostrify/react
```

:::

## Setting up NostrProvider

The `NostrProvider` component creates a shared Nostr context that makes relay connections available throughout your React application.

Here's a simple implementation that you can copy and use in your project:

```tsx
// NostrProvider.tsx
import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext, type NostrContextType } from '@nostrify/react';
import React, { useRef } from 'react';

interface NostrProviderProps {
  children: React.ReactNode;
  relays: `wss://${string}`[];
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children, relays } = props;

  // Create NPool instance only once
  const pool = useRef<NPool>(undefined);

  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        return new Map(relays.map((url) => [url, filters]));
      },
      eventRouter(_event: NostrEvent) {
        return relays;
      },
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
```

### Integrating the Provider in Your App

Here's how to integrate the `NostrProvider` into your React application:

```tsx
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.tsx';
import NostrProvider from './NostrProvider.tsx';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NostrProvider relays={['wss://relay.damus.io', 'wss://relay.nostr.band']}>
      <App />
    </NostrProvider>
  </React.StrictMode>,
);
```

## The `useNostr` Hook

Now you can access the pool from any component or hook.

```tsx
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

// You can use react-query or any other data fetching solution.
function useFeed() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['feed'],
    queryFn: () => nostr.query([{ kinds: [1, 6], limit: 20 }]),
  });
}

// Component to render Nostr events.
function Feed() {
  const { data: events } = useFeed();

  return (
    <div>
      {events.map((event) => <div>{event.content}</div>)}
    </div>
  );
}
```

## Next Steps

- Add authentication by implementing a signer (see [Signing Documentation](/sign/))
- Implement caching for better performance (see [Storage Documentation](/store/))
- Create more specific hooks for different Nostr use cases

This simple implementation provides a foundation for integrating Nostrify into your React application using the official `@nostrify/react` package.
