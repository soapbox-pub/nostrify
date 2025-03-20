import { NostrProvider } from './NostrProvider.tsx';
import { useNostr } from './useNostr.ts';
import { useNostrEvents } from './useNostrEvents.ts';

function App() {
  return (
    <NostrProvider relays={['wss://ditto.pub/relay']}>
      <HomePage />
    </NostrProvider>
  );
}

function HomePage() {
  const { user, login } = useNostr();

  const { events } = useNostrEvents(
    [{ kinds: [0], authors: [user!.pubkey] }],
    { enabled: !!user },
  );

  if (user) {
    const [author] = events;

    if (author) {
      const { name } = JSON.parse(author.content);
      return <div>Welcome back, {name}!</div>;
    }

    return <div>You: {user.pubkey}</div>;
  }

  if (login.isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <button
      type='button'
      onClick={() => login.extension()}
    >
      Log in
    </button>
  );
}

export default App;
