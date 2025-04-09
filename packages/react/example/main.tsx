import { NostrProvider } from '@nostrify/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.tsx';

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
    <NostrProvider appName='MyApp' relays={['wss://ditto.pub/relay']}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </NostrProvider>
  </React.StrictMode>,
);
