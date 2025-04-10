import { useContext } from 'react';

import { NostrLoginContext, type NostrLoginContextType } from './NostrLoginContext.ts';

export function useNostrLoginContext(): NostrLoginContextType {
  const context = useContext(NostrLoginContext);

  if (!context) {
    throw new Error('useNostrLoginContext must be used within a NostrLoginProvider');
  }

  return context;
}
