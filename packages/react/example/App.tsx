import { Suspense } from 'react';

import { useAuthor } from './useAuthor.ts';
import { useLoginActions } from './useLoginActions.ts';
import { useNostrUser } from './useNostrUser.ts';
import { useProfile } from './useProfile.ts';
import { useSocialFeed } from './useSocialFeed.ts';

import type { NostrEvent } from '@nostrify/nostrify';

function App() {
  const { user } = useNostrUser();

  const login = useLoginActions();
  const profile = useProfile();

  function renderLogin() {
    if (user) {
      if (profile.data?.name) {
        return <div>Welcome back, {profile.data.name}!</div>;
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
  const { data: author } = useAuthor(event.pubkey);

  return (
    <div key={event.id} style={{ border: '1px solid gray', padding: '10px', margin: '20px 0' }}>
      <div>{author.name ?? event.pubkey}</div>
      <div>{event.content}</div>
    </div>
  );
}

export default App;
