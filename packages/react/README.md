# @nostrify/react

React components and hooks for Nostrify, a comprehensive Nostr framework.

## Installation

::: code-group

```sh [npm]
npx jsr add @nostrify/react
```

```sh [Deno]
deno add jsr:@nostrify/react
```

```sh [yarn]
yarn add jsr:@nostrify/react
```

```sh [pnpm]
pnpm add jsr:@nostrify/react
```

```sh [Bun]
bunx jsr add @nostrify/react
```

:::

## Usage

### NostrContext Provider

```tsx
import { NostrContext } from '@nostrify/react';
import { NRelay1 } from '@nostrify/nostrify';

function App() {
  return (
    <NostrContext.Provider
      value={{
        relay: new NRelay1('wss://relay.example.com'),
      }}
    >
      <YourApp />
    </NostrContext.Provider>
  );
}
```

### Login Provider

```tsx
import { NostrLoginProvider } from '@nostrify/react/login';

function App() {
  return (
    <NostrLoginProvider storageKey='nostrify-logins'>
      <YourApp />
    </NostrLoginProvider>
  );
}
```

### Using Hooks

```tsx
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';

function YourComponent() {
  const { relay } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();

  // Your component logic here
}
```

## Developer Notes

This package uses a preprocess script to compile TSX files to JavaScript for Node.js compatibility.
