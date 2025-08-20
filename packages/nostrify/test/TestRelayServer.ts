import { MockRelay } from './mod.ts';
import { NostrClientMsg, NostrEvent, NostrRelayMsg } from '@nostrify/types';
import { NSchema as n } from '../NSchema.ts';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

interface TestRelayServerOpts {
  handleMessage?(socket: WebSocket, msg: NostrClientMsg): Promise<void> | void;
}

export class TestRelayServer {
  private port = 0;
  private httpServer: Server;
  private wsServer: WebSocketServer;
  private connections = new Set<WebSocket>();
  private controllers = new Map<string, AbortController>();
  private store = new MockRelay();

  constructor(private opts?: TestRelayServerOpts) {
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });
    this.setupWebSocketServer();
    this.httpServer.listen(0, '127.0.0.1', () => {
      this.port = (this.httpServer.address() as AddressInfo).port;
    });
  }

  private setupWebSocketServer(): void {
    this.wsServer.on('connection', (socket: WebSocket) => {
      this.connections.add(socket);

      socket.on('close', () => {
        this.connections.delete(socket);
        // Clean up any subscriptions for this socket
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
        } catch (error) {
          // Handle parsing errors silently
        }
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connections.delete(socket);
      });
    });
  }

  send(socket: WebSocket, msg: NostrRelayMsg): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  private async handleMessage(
    socket: WebSocket,
    msg: NostrClientMsg,
  ): Promise<void> {
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
    const addr = this.httpServer.address() as AddressInfo;
    return `ws://${addr.address}:${addr.port}`;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.connections.forEach((conn) => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.close();
        }
      });
      this.connections.clear();

      // Abort all controllers
      this.controllers.forEach((controller) => controller.abort());
      this.controllers.clear();

      // Close WebSocket server
      this.wsServer.close(() => {
        // Close HTTP server
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }

  open(): void {
    if (!this.httpServer.listening) {
      this.httpServer = createServer();
      this.wsServer = new WebSocketServer({ server: this.httpServer });
      this.setupWebSocketServer();
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.port = (this.httpServer.address() as AddressInfo).port;
      });
    }
  }

  event(event: NostrEvent): Promise<void> {
    return this.store.event(event);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}