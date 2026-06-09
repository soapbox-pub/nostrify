import type { NostrSigner, NUploader } from "@nostrify/types";
import { toHex } from "@smithy/util-hex-encoding";
import { z } from "zod";

import { N64 } from "../utils/N64.ts";

/** NIP-94 style tags returned by the uploader, with the public URL guaranteed first. */
type UploadTags = [["url", string], ...string[][]];

/** Authorization verb used in the kind 24242 `t` tag (Blossom BUD-11). */
type BlossomVerb = "get" | "upload" | "list" | "delete" | "media";

/** BlossomUploader options. */
export interface BlossomUploaderOpts {
  /** Blossom servers to use. */
  servers: Request["url"][];
  /** Signer for Blossom authorizations. */
  signer: NostrSigner;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
  /** Number of milliseconds until each request should expire. (Default: `60_000`) */
  expiresIn?: number;
  /**
   * Scope each authorization to the target server by adding a `server` tag with the server's domain (BUD-11).
   * This produces a distinct authorization event per server. (Default: `false`)
   */
  scopeToServer?: boolean;
}

/**
 * Upload files to Blossom servers.
 *
 * Implements the [Blossom](https://github.com/hzrd149/blossom) protocol:
 * [BUD-02](https://github.com/hzrd149/blossom/blob/master/buds/02.md) (`PUT /upload`),
 * [BUD-04](https://github.com/hzrd149/blossom/blob/master/buds/04.md) (`PUT /mirror`),
 * [BUD-05](https://github.com/hzrd149/blossom/blob/master/buds/05.md) (`PUT /media`),
 * [BUD-08](https://github.com/hzrd149/blossom/blob/master/buds/08.md) (`nip94` descriptor field), and
 * [BUD-11](https://github.com/hzrd149/blossom/blob/master/buds/11.md) (Nostr authorization).
 */
export class BlossomUploader implements NUploader {
  private servers: Request["url"][];
  private signer: NostrSigner;
  private fetch: typeof fetch;
  private expiresIn: number;
  private scopeToServer: boolean;

  constructor(opts: BlossomUploaderOpts) {
    this.servers = opts.servers;
    this.signer = opts.signer;
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.expiresIn = opts.expiresIn ?? 60_000;
    this.scopeToServer = opts.scopeToServer ?? false;
  }

  /** Upload a file via `PUT /upload` (BUD-02) and return NIP-94 tags from the first server to succeed. */
  async upload(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<UploadTags> {
    const x = await BlossomUploader.sha256(file);
    const authorize = await this.authorizer({
      verb: "upload",
      content: `Upload ${file.name}`,
      x,
    });

    return Promise.any(
      this.servers.map(async (server) => {
        const authorization = await authorize(server);

        const response = await this.fetch(new URL("/upload", server), {
          method: "PUT",
          body: file,
          headers: {
            authorization,
            "content-type": file.type,
            "x-sha-256": x,
          },
          signal: opts?.signal,
        });

        return BlossomUploader.parse(response, x);
      }),
    );
  }

  /** Optimize a file via `PUT /media` (BUD-05) and return NIP-94 tags from the first server to succeed. */
  async media(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<UploadTags> {
    const x = await BlossomUploader.sha256(file);
    const authorize = await this.authorizer({
      verb: "media",
      content: `Optimize ${file.name}`,
      x,
    });

    return Promise.any(
      this.servers.map(async (server) => {
        const authorization = await authorize(server);

        const response = await this.fetch(new URL("/media", server), {
          method: "PUT",
          body: file,
          headers: {
            authorization,
            "content-type": file.type,
            "x-sha-256": x,
          },
          signal: opts?.signal,
        });

        // The optimized blob differs from the source, so use its original hash as `ox`.
        return BlossomUploader.parse(response, x);
      }),
    );
  }

  /**
   * Mirror an existing remote blob via `PUT /mirror` (BUD-04) and return NIP-94 tags from the first server to succeed.
   *
   * The blob's sha256 hash is needed for the authorization `x` tag. It is taken from `opts.sha256` when provided,
   * otherwise extracted from the blob URL.
   */
  async mirror(
    blobUrl: string,
    opts?: { sha256?: string; signal?: AbortSignal },
  ): Promise<UploadTags> {
    const x = opts?.sha256 ?? BlossomUploader.hashFromUrl(blobUrl);
    const authorize = await this.authorizer({
      verb: "upload",
      content: `Mirror ${blobUrl}`,
      x,
    });

    return Promise.any(
      this.servers.map(async (server) => {
        const authorization = await authorize(server);

        const response = await this.fetch(new URL("/mirror", server), {
          method: "PUT",
          body: JSON.stringify({ url: blobUrl }),
          headers: {
            authorization,
            "content-type": "application/json",
          },
          signal: opts?.signal,
        });

        return BlossomUploader.parse(response, x);
      }),
    );
  }

  /**
   * Build a function that returns a `Nostr` authorization header for a given server.
   *
   * Authorization events without a `server` tag can be reused across every server, so the event is signed once
   * up front when `scopeToServer` is disabled. When `scopeToServer` is enabled, a distinct event is signed per
   * server so the `server` tag can scope the token to that server's domain (BUD-11).
   */
  private async authorizer(
    opts: { verb: BlossomVerb; content: string; x?: string },
  ): Promise<(server: Request["url"]) => Promise<string>> {
    if (this.scopeToServer) {
      return (server) => this.authorize(opts, server);
    }

    const authorization = await this.authorize(opts);
    return () => Promise.resolve(authorization);
  }

  /** Build a `Nostr` authorization header value with a signed kind 24242 event (BUD-11). */
  private async authorize(
    opts: { verb: BlossomVerb; content: string; x?: string },
    server?: Request["url"],
  ): Promise<string> {
    const now = Date.now();

    const tags: string[][] = [
      ["t", opts.verb],
      ["expiration", Math.floor((now + this.expiresIn) / 1000).toString()],
    ];

    if (opts.x) {
      tags.push(["x", opts.x]);
    }

    if (server) {
      tags.push(["server", new URL(server).hostname]);
    }

    const event = await this.signer.signEvent({
      kind: 24242,
      content: opts.content,
      created_at: Math.floor(now / 1000),
      tags,
    });

    return `Nostr ${N64.encodeEventUrl(event)}`;
  }

  /** Parse a Blossom response into NIP-94 tags, throwing on error responses. */
  private static async parse(
    response: Response,
    originalHash?: string,
  ): Promise<UploadTags> {
    const text = await response.text();

    if (!response.ok) {
      const reason = response.headers.get("x-reason");
      throw new Error(
        `Blossom request failed (${response.status}): ${reason ?? text}`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Blossom server returned non-JSON response: ${text}`);
    }

    const data = BlossomUploader.schema().parse(json);

    // Prefer the server-provided NIP-94 tags when present (BUD-08), ensuring `url` comes first.
    if (data.nip94?.length) {
      const url = data.nip94.find(([name]) => name === "url")?.[1] ?? data.url;
      const rest = data.nip94.filter(([name]) => name !== "url");
      return [["url", url], ...rest];
    }

    const tags: UploadTags = [
      ["url", data.url],
      ["x", data.sha256],
      ["ox", originalHash ?? data.sha256],
      ["size", data.size.toString()],
    ];

    if (data.dim) {
      tags.push(["dim", data.dim]);
    }

    if (data.type) {
      tags.push(["m", data.type]);
    }

    return tags;
  }

  /** Compute the lowercase hex sha256 hash of a file. */
  private static async sha256(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return toHex(new Uint8Array(digest));
  }

  /** Extract a 64-character hex sha256 hash from a blob URL, if present. */
  private static hashFromUrl(url: string): string | undefined {
    return new URL(url).pathname.match(/[0-9a-f]{64}/)?.[0];
  }

  /** Blossom "BlobDescriptor" schema. */
  private static schema() {
    return z.object({
      url: z.string(),
      sha256: z.string(),
      size: z.number(),
      type: z.string().optional(),
      uploaded: z.number().optional(),
      dim: z.string().regex(/^\d+x\d+$/).optional().catch(undefined),
      nip94: z.array(z.array(z.string())).optional().catch(undefined),
    });
  }
}
