import { MockRelay } from './mod.ts';
import type { NostrClientMsg, NostrEvent, NostrRelayMsg } from '@nostrify/types';
import { NSchema as n } from '../NSchema.ts';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Buffer } from 'node:buffer';

interface TestRelayServerOpts {
  handleMessage?(socket: WebSocket, msg: NostrClientMsg): Promise<void> | void;
}

export class TestRelayServer {
  private port = 0;
  private inited = false;
  private httpServer: Server;
  private wsServer: WebSocketServer;
  private opts: TestRelayServerOpts;
  private connections = new Set<WebSocket>();
  private controllers = new Map<string, AbortController>();
  private store = new MockRelay();

  constructor(opts?: TestRelayServerOpts) {
    this.opts = opts || {};
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });
    this.setupWebSocketServer();
  }

  init() {
    const { resolve, promise } = Promise.withResolvers<void>();
    this.httpServer.listen(0, '127.0.0.1', () => {
      this.port = (this.httpServer.address() as AddressInfo).port;
      this.inited = true;
      resolve();
    });

    return promise;
  }

  private setupWebSocketServer(): void {
    this.wsServer.on('connection', (socket: WebSocket) => {
      this.connections.add(socket);

      socket.on('close', () => {
        this.connections.delete(socket);
        for (const [subId, controller] of this.controllers.entries()) {
          controller.abort();
          this.controllers.delete(subId);
        }
      });

      socket.on('message', (data: Buffer) => {
        try {
          const result = n.json().pipe(n.clientMsg()).safeParse(data.toString());
          if (result.success) {
            const handleMessage = this.opts?.handleMessage ??
              this.handleMessage.bind(this);
            handleMessage(socket, result.data);
          }
        } catch {
          // do nothing
        }
      });

      socket.on('error', (error: any) => {
        console.error('WebSocket error:', error);
        this.connections.delete(socket);
      });
    });
  }

  send(socket: WebSocket, msg: NostrRelayMsg): void {
    if (!this.inited) throw new Error('TestRelayServer not initialized');
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  private async handleMessage(
    socket: WebSocket,
    msg: NostrClientMsg,
  ): Promise<void> {
    if (!this.inited) throw new Error('TestRelayServer not initialized');

    switch (msg[0]) {
      case 'REQ': {
        const [_, subId, ...filters] = msg;

        const controller = new AbortController();
        this.controllers.set(subId, controller);

        try {
          for await (
            const msg of this.store.req(filters, { signal: controller.signal })
          ) {
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

  get url(): string {
    if (!this.inited) throw new Error('TestRelayServer not initialized');
    const addr = this.httpServer.address() as AddressInfo;
    return `ws://${addr.address}:${addr.port}`;
  }

  // deno-lint-ignore require-await
  async close(): Promise<void> {
    if (!this.inited) throw new Error('TestRelayServer not initialized');
    return new Promise((resolve) => {
      this.connections.forEach((conn) => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.close();
        }
      });
      this.connections.clear();

      this.controllers.forEach((controller) => controller.abort());
      this.controllers.clear();

      this.wsServer.close(() => {
        this.httpServer.close(() => {
          this.inited = false;
          resolve();
        });
      });
    });
  }

  open(): Promise<void> {
    if (this.inited) throw new Error('TestRelayServer already initialized');
    if (!this.httpServer.listening) {
      const { resolve, promise } = Promise.withResolvers<void>();
      this.httpServer = createServer();
      this.wsServer = new WebSocketServer({ server: this.httpServer });
      this.setupWebSocketServer();
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.port = (this.httpServer.address() as AddressInfo).port;
        this.inited = true;
        resolve();
      });
      return promise;
    }
    return Promise.resolve();
  }

  event(event: NostrEvent): Promise<void> {
    if (!this.inited) throw new Error('TestRelayServer not initialized');
    return this.store.event(event);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.inited) {
      await this.close();
    }
  }

  static async create(opts?: TestRelayServerOpts) {
    const server = new TestRelayServer(opts);
    await server.init();
    return server;
  }
}
