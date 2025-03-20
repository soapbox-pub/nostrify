import { useEffect, useState } from 'react';
import { NostrProvider } from './NostrProvider.tsx';
import { useNostr } from './useNostr.ts';

import type { NostrEvent } from '@nostrify/nostrify';

function App() {
  return (
    <NostrProvider relay='wss://ditto.pub/relay'>
      <HomePage />
    </NostrProvider>
  );
}

function HomePage() {
  const { user, relay } = useNostr();

  const [events, setEvents] = useState<NostrEvent[]>([]);

  useEffect(() => {
    if (user) {
      relay.query([{ kinds: [0], authors: [user.pubkey] }]).then(setEvents);
    }
  }, [user, relay]);

  if (user) {
    const [author] = events;

    if (author) {
      const { name } = JSON.parse(author.content);
      return <div>Welcome back, {name}!</div>;
    }

    return <div>You: {user.pubkey}</div>;
  }

  return <div>Not logged in</div>;
}

export default App;
