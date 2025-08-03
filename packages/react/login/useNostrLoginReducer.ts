import { useEffect, useReducer } from 'react';

import { type NLoginAction, nostrLoginReducer } from './nostrLoginReducer.js';

import type { NLoginType } from './NLogin.js';

export function useNostrLoginReducer(
  storageKey: string,
): [state: NLoginType[], dispatch: (action: NLoginAction) => void] {
  const [state, dispatch] = useReducer(nostrLoginReducer, [], () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  return [state, dispatch];
}
