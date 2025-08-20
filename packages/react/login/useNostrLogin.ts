import { useContext } from 'react';

import { NostrLoginContext, type NostrLoginContextType } from './NostrLoginContext.ts';

export function useNostrLogin(): NostrLoginContextType {
  const context = useContext(NostrLoginContext);

  if (!context) {
    throw new Error('useNostrLogin must be used within a NostrLoginProvider');
  }

  return context;
}
