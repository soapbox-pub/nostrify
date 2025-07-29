import { NostrLoginProvider } from '@nostrify/react/login';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import ReactDOM from 'react-dom/client';

import App from './Appx';
import NostrProvider from './NostrProviderx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: Infinity,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NostrLoginProvider storageKey='myapp'>
        <NostrProvider relays={['wss://ditto.pub/relay']}>
          <Suspense>
            <App />
          </Suspense>
        </NostrProvider>
      </NostrLoginProvider>
    </QueryClientProvider>
  </StrictMode>,
);
