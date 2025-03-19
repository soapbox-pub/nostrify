import { NPool, type NRelay, NRelay1 } from '@nostrify/nostrify';
import { createContext, useContext } from 'react';

export interface NostrContext {
  userRelays?: Set<string>;
  pool?: NPool<NRelay>;
}

const Ctx = createContext<NostrContext | null>(null);

interface NostrProviderProps {
  defaultRelays?: string[];
  children: React.ReactNode;
}

export const NostrProvider: React.FC<NostrProviderProps> = ({ defaultRelays = [], children }) => {
  const pool = new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: () => {},
    eventRouter: async () => {
      const [relayList] = await pool.query([{ authors: [pubkey] }])
    },
  });

  return (
    <Ctx.Provider value={{ pool }}>
      {children}
    </Ctx.Provider>
  );
};

export function useNostr(): NostrContext {
  const context = useContext(Ctx);

  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }

  return context;
}
