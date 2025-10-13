import type { NLoginType } from './NLogin.ts';

export type NLoginAction =
  | { type: 'login.add'; login: NLoginType; set?: boolean }
  | { type: 'login.remove'; id: string }
  | { type: 'login.set'; id: string }
  | { type: 'login.clear' };

export function nostrLoginReducer(
  state: NLoginType[],
  action: NLoginAction,
): NLoginType[] {
  switch (action.type) {
    case 'login.add': {
      const filtered = state.filter((login) => login.id !== action.login.id);
      return action.set ? [action.login, ...filtered] : [...filtered, action.login];
    }

    case 'login.remove': {
      return state.filter((login) => login.id !== action.id);
    }

    case 'login.set': {
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
