import { NostrClientMsg, NostrEvent, NostrRelayMsg, NSchema as n } from '@nostrify/nostrify';
import { MockRelay } from '@nostrify/nostrify/test';

interface TestRelayServerOpts {
  handleMessage?(socket: WebSocket, msg: NostrClientMsg): Promise<void>;
}

export class TestRelayServer {
  private port = 0;
  private server: Deno.HttpServer<Deno.NetAddr>;
  private connections = new Set<WebSocket>();
  private controllers = new Map<string, AbortController>();
  private store = new MockRelay();

  constructor(private opts?: TestRelayServerOpts) {
    this.server = this.createServer();
    this.port = this.server.addr.port;
  }

  private createServer(): Deno.HttpServer<Deno.NetAddr> {
    return Deno.serve({ hostname: '127.0.0.1', port: this.port }, (req) => {
      const { response, socket } = Deno.upgradeWebSocket(req);

      socket.onopen = () => {
        this.connections.add(socket);
      };

      socket.onclose = () => {
        this.connections.delete(socket);
      };

      socket.onmessage = (e) => {
        const result = n.json().pipe(n.clientMsg()).safeParse(e.data);
        if (result.success) {
          const handleMessage = this.opts?.handleMessage ?? this.handleMessage.bind(this);
          handleMessage(socket, result.data);
        }
      };

      return response;
    });
  }

  send(socket: WebSocket, msg: NostrRelayMsg): void {
    socket.send(JSON.stringify(msg));
  }

  private async handleMessage(socket: WebSocket, msg: NostrClientMsg): Promise<void> {
    switch (msg[0]) {
      case 'REQ': {
        const [_, subId, ...filters] = msg;

        const controller = new AbortController();
        this.controllers.set(subId, controller);

        try {
          for await (const msg of this.store.req(filters, { signal: controller.signal })) {
            msg[1] = subId;
            this.send(socket, msg);
          }
        } catch {
          // do nothing
        }

        break;
      }

      case 'CLOSE': {
        const subId = msg[1];
        this.controllers.get(subId)?.abort();
        this.controllers.delete(subId);
        break;
      }

      case 'EVENT': {
        const [_, event] = msg;
        await this.store.event(event);
        this.send(socket, ['OK', event.id, true, '']);
        break;
      }
    }
  }

  get url() {
    return `ws://${this.server.addr.hostname}:${this.server.addr.port}`;
  }

  async close(): Promise<void> {
    this.connections.forEach((conn) => conn.close());
    this.connections = new Set<WebSocket>();

    await this.server.shutdown();
  }

  open(): void {
    this.server = this.createServer();
  }

  event(event: NostrEvent): Promise<void> {
    return this.store.event(event);
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
