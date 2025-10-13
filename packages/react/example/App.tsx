import { Suspense } from 'react';

import { useAuthor } from './useAuthor';
import { useCurrentUser } from './useCurrentUser';
import { useLoginActions } from './useLoginActions';
import { useSocialFeed } from './useSocialFeed';

import type { NostrEvent } from '@nostrify/nostrify';

function App() {
  const { user, metadata } = useCurrentUser();

  const login = useLoginActions();

  function renderLogin() {
    if (user) {
      if (metadata.name) {
        return <div>Welcome back, {metadata.name}!</div>;
      }

      return <div>You: {user.pubkey}</div>;
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
      <Suspense fallback={<div>Loading...</div>}>
        <Feed />
      </Suspense>
    </div>
  );
}

function Feed() {
  const feed = useSocialFeed();

  return (
    <>
      {feed.data?.map((note) => <FeedPost key={note.id} event={note} />)}
    </>
  );
}

function FeedPost({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);

  return (
    <div
      key={event.id}
      style={{ border: '1px solid gray', padding: '10px', margin: '20px 0' }}
    >
      <div>{author.name ?? event.pubkey}</div>
      <div>{event.content}</div>
    </div>
  );
}

export default App;
