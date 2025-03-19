import { createContext } from 'react';

import type { NPool, NRelay } from '@nostrify/nostrify';

export interface NostrContextType {
  pool: NPool<NRelay>;
}

export const NostrContext = createContext<NostrContextType | undefined>(undefined);
