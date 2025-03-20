import type { NLogin, NState } from './NState.ts';

export type NAction =
  | { type: 'login.add'; login: NLogin; switch?: boolean }
  | { type: 'login.remove'; index: number }
  | { type: 'login.switch'; index: number };

export function nostrReducer(state: NState, action: NAction): NState {
  switch (action.type) {
    case 'login.add': {
      const filtered = state.logins.filter((login) => !loginsMatch(login, action.login));
      const logins = action.switch ? [action.login, ...filtered] : [...filtered, action.login];

      return { ...state, logins };
    }

    case 'login.remove': {
      const logins = state.logins.filter((_, i) => i !== action.index);
      return { ...state, logins };
    }

    case 'login.switch': {
      const login = state.logins[action.index];

      if (!login) {
        return state;
      }

      const filtered = state.logins.filter((_, i) => i !== action.index);
      const logins = [login, ...filtered];

      return { ...state, logins };
    }

    default: {
      return state;
    }
  }
}

function loginsMatch(a: NLogin, b: NLogin): boolean {
  return a.type === b.type && a.pubkey === b.pubkey;
}
