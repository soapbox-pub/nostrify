import { NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from './NostrContext.ts';

interface NostrProviderProps {
  children: React.ReactNode;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ children }) => {
  const pool = new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: () => {
      // TODO
      return Promise.resolve(new Map());
    },
    eventRouter: () => {
      // TODO
      return Promise.resolve([]);
    },
  });

  return (
    <NostrContext.Provider value={{ pool }}>
      {children}
    </NostrContext.Provider>
  );
};
