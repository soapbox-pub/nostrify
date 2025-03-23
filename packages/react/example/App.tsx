import { useNostr, useNostrEvents } from '@nostrify/react';

function App() {
  const { user, login } = useNostr();

  const { events: [author] } = useNostrEvents(
    user ? [{ kinds: [0], authors: [user.pubkey] }] : [],
  );

  const { events: notes } = useNostrEvents([{ kinds: [1], limit: 20 }]);

  function renderLogin() {
    if (user) {
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

  return (
    <div>
      <h2>Login</h2>
      {renderLogin()}

      <h2>Notes</h2>
      {notes.map((note) => (
        <div key={note.id}>
          {note.content}
          <br />
          <br />
        </div>
      ))}
    </div>
  );
}

export default App;
