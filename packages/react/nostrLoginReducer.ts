import type { NLogin } from './NLogin.ts';

export type NLoginAction =
  | { type: 'login.add'; login: NLogin; switch?: boolean }
  | { type: 'login.remove'; index: number }
  | { type: 'login.switch'; index: number };

export function nostrLoginReducer(state: NLogin[], action: NLoginAction): NLogin[] {
  switch (action.type) {
    case 'login.add': {
      const filtered = state.filter((login) => !loginsMatch(login, action.login));
      return action.switch ? [action.login, ...filtered] : [...filtered, action.login];
    }

    case 'login.remove': {
      return state.filter((_, i) => i !== action.index);
    }

    case 'login.switch': {
      const login = state[action.index];

      if (!login) {
        return state;
      }

      const filtered = state.filter((_, i) => i !== action.index);
      return [login, ...filtered];
    }

    default: {
      return state;
    }
  }
}

function loginsMatch(a: NLogin, b: NLogin): boolean {
  return a.type === b.type && a.pubkey === b.pubkey;
}
