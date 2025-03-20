import { NostrProvider } from './NostrProvider.tsx';
import { useNostr } from './useNostr.ts';

function App() {
  return (
    <NostrProvider>
      <Page />
    </NostrProvider>
  );
}

function Page() {
  const { user } = useNostr();

  if (user) {
    return <div>{user.pubkey}</div>;
  }

  return <div>Not logged in</div>;
}

export default App;
