import { useNostr } from '@nostrify/react';

import { useProfile } from './useProfile.ts';
import { useSocialFeed } from './useSocialFeed.ts';

function App() {
  const { user, login } = useNostr();

  const profile = useProfile();
  const feed = useSocialFeed();

  function renderLogin() {
    if (user) {
      if (profile.data?.name) {
        return <div>Welcome back, {profile.data.name}!</div>;
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
      {feed.data?.map((note) => (
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
