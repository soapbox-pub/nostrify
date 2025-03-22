import { createContext } from 'react';

import type { NostrSigner, NRelay } from '@nostrify/nostrify';
import type { NState } from './NState.ts';
import type { NAction } from './nostrReducer.ts';

export interface NostrContextType {
  nostr: NRelay;
  state: NState;
  dispatch: React.ActionDispatch<[action: NAction]>;
  windowSigner?: NostrSigner;
}

export const NostrContext = createContext<NostrContextType | undefined>(undefined);
