import type { NLogin } from './NLogin.ts';

export type NLoginAction =
  | { type: 'login.add'; login: NLogin; switch?: boolean }
  | { type: 'login.remove'; id: string }
  | { type: 'login.switch'; id: string }
  | { type: 'login.clear' };

export function nostrLoginReducer(state: NLogin[], action: NLoginAction): NLogin[] {
  switch (action.type) {
    case 'login.add': {
      const filtered = state.filter((login) => login.id !== action.login.id);
      return action.switch ? [action.login, ...filtered] : [...filtered, action.login];
    }

    case 'login.remove': {
      return state.filter((login) => login.id !== action.id);
    }

    case 'login.switch': {
      const login = state.find((login) => login.id === action.id);

      if (!login) {
        return state;
      }

      const filtered = state.filter((login) => login.id !== action.id);
      return [login, ...filtered];
    }

    case 'login.clear': {
      return [];
    }

    default: {
      return state;
    }
  }
}
