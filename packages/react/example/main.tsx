import { NostrLoginProvider } from '@nostrify/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.tsx';
import NostrProvider from './NostrProvider.tsx';

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
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NostrLoginProvider storageKey='myapp'>
        <NostrProvider appName='MyApp' relays={['wss://ditto.pub/relay']}>
          <App />
        </NostrProvider>
      </NostrLoginProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
