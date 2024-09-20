export class TestRelayServer {
  private port = 0;
  private server: Deno.HttpServer<Deno.NetAddr>;
  private connections = new Set<WebSocket>();

  constructor() {
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

      return response;
    });
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

  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
