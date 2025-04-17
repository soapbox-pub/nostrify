import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';

export function useLoginActions() {
  const { nostr } = useNostr();
  const { addLogin } = useNostrLogin();

  return {
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
  };
}
