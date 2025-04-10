import { useContext } from 'react';

import { NostrContext, type NostrContextType } from './NostrContext.ts';

export function useNostr(): NostrContextType {
  const context = useContext(NostrContext);

  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }

  return context;
}
