import type { NLogin } from './NLogin.ts';

export interface NState {
  current: number;
  logins: NLogin[];
}
