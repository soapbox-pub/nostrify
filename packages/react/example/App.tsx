import { useNostr, useNostrEvents } from '@nostrify/react';

function App() {
  const { user, login } = useNostr();

  const { events, error } = useNostrEvents(
    user ? [{ kinds: [0], authors: [user.pubkey] }] : [],
  );

  if (error) {
    return <div>Error: {error.message}</div>;
  }

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
