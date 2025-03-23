import { NostrProvider } from '@nostrify/react';
import ReactDOM from 'react-dom/client';
import React from 'react';

import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NostrProvider relays={['wss://ditto.pub/relay']}>
      <App />
    </NostrProvider>
  </React.StrictMode>,
);
