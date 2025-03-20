import { createContext } from 'react';

import type { NRelay } from '@nostrify/nostrify';
import type { NState } from './NState.ts';

export interface NostrContextType {
  pool: NRelay;
  relay: NRelay;
  state: NState;
}

export const NostrContext = createContext<NostrContextType | undefined>(undefined);
