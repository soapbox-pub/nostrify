import { useEffect, useReducer } from 'react';

import { type NLoginAction, nostrLoginReducer } from './nostrLoginReducer.ts';

import type { NLogin } from './NLogin.ts';

export function useNostrLoginReducer(storageKey: string): [state: NLogin[], dispatch: (action: NLoginAction) => void] {
  const [state, dispatch] = useReducer(nostrLoginReducer, [], () => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  return [state, dispatch];
}
