import { NostrEvent, NostrFilter, NostrRelayOK } from '@nostrify/types';
import { Server } from 'mock-socket';
import { matchFilters } from 'nostr-tools';

interface WsSender {
  send(data: any): void;
}

export class MockRelayWs {
  server: Server;
  events: NostrEvent[];
  first: boolean;

  static send(socket: WsSender, subscription: string, event: NostrEvent) {
    socket.send(JSON.stringify(['EVENT', subscription, event]));
  }

  close() {
    this.server.close();
  }

  constructor(url: string, preloaded?: NostrEvent[]) {
    this.first = true;
    this.events = preloaded || [];
    this.server = new Server(url);
    this.server.on('connection', (conn) => {
      const subscriptions: Map<string, { socket: typeof conn; filters: NostrFilter[] }> = new Map();

      conn.on('message', (msg) => {
        const parsed = JSON.parse(msg as string);

        switch (parsed[0]) {
          case 'REQ': {
            const [_, id, ...filters] = parsed;
            subscriptions.set(id, { socket: conn, filters });

            this.events
              .filter((evt) => matchFilters(filters, evt))
              .forEach((evt) => MockRelayWs.send(conn, id, evt));

            if (this.events.length && this.first) {
              this.first = !this.first;
              conn.send(JSON.stringify(['EOSE', id]));
            }
            break;
          }

          case 'CLOSE': {
            const [_, id] = parsed;
            subscriptions.delete(id);
            break;
          }

          case 'EVENT': {
            const [_, evt] = parsed;
            const ok: NostrRelayOK = ['OK', evt.id, true, ''];
            conn.send(JSON.stringify(ok));
            for (const [id, { filters, socket }] of subscriptions.entries()) {
              if (matchFilters(filters, evt)) MockRelayWs.send(socket, id, evt);
            }
            this.events.push(evt);
            break;
          }
        }
      });
    });
  }
}
