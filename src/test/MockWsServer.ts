import { Server } from 'mock-socket';
import { NostrFilter } from '../../interfaces/NostrFilter.ts';
import { matchFilters } from 'nostr-tools';
import { NostrEvent } from '../../interfaces/NostrEvent.ts';

interface WsSender {
  send(data: any): void;
}

export class MockWsServer {
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
      const subscriptions: Map<string, { socket: typeof conn, filters: NostrFilter[] }> = new Map();

      conn.on('message', (msg) => {
        const parsed = JSON.parse(msg as string);

        switch (parsed[0]) {
          case 'REQ': {
            const [_, id, ...filters] = parsed;
            subscriptions.set(id, { socket: conn, filters });
            console.log('new req', filters);

            this.events
              .filter(evt => matchFilters(filters, evt))
              .forEach(evt => MockWsServer.send(conn, id, evt));

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
            conn.send(JSON.stringify(['OK', evt.id, 'true']));
            for (const [id, { filters, socket }] of subscriptions.entries()) {
              if (matchFilters(filters, evt)) MockWsServer.send(socket, id, evt);
            }
            this.events.push(evt);
            break;
          }
        }
      });
    })
  }
}