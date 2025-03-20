import { createContext } from 'react';

import type { NRelay } from '@nostrify/nostrify';
import type { NState } from './NState.ts';
import type { NAction } from './nostrReducer.ts';

export interface NostrContextType {
  pool: NRelay;
  state: NState;
  dispatch: React.ActionDispatch<[action: NAction]>;
}

export const NostrContext = createContext<NostrContextType | undefined>(undefined);
