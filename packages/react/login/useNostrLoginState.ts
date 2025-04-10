import { useContext } from 'react';

import { NostrLoginContext, type NostrLoginContextType } from './NostrLoginContext.ts';

export function useNostrLoginState(): NostrLoginContextType {
  const context = useContext(NostrLoginContext);

  if (!context) {
    throw new Error('useNostrLoginState must be used within a NostrLoginProvider');
  }

  return context;
}
