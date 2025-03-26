import { type Context, createContext } from 'react';

import type { NostrSigner, NRelay } from '@nostrify/nostrify';
import type { NState } from './NState.ts';
import type { NAction } from './nostrReducer.ts';

export interface NostrContextType {
  nostr: NRelay;
  local: NRelay;
  /** @deprecated FIXME: remove, expose only actions */
  state: NState;
  /** @deprecated FIXME: remove, expose only actions */
  dispatch: (action: NAction) => void;
  windowSigner?: NostrSigner;
  pool: { relay(url: string): NRelay };
}

export const NostrContext: Context<NostrContextType | undefined> = createContext<NostrContextType | undefined>(
  undefined,
);
