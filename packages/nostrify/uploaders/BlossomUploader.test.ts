import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { generateSecretKey } from "nostr-tools";
import process from "node:process";
import { BlossomUploader } from "./BlossomUploader.ts";
import { NSecSigner } from "../NSecSigner.ts";
import { N64 } from "../utils/N64.ts";
import type { NostrEvent, NostrSigner } from "@nostrify/types";
import fs from "node:fs/promises";
import { URL } from "node:url";
import { Readable } from "node:stream";

/** Wraps a signer to count how many events it signs. */
class CountingSigner implements NostrSigner {
  count = 0;
  private signer: NostrSigner;
  constructor(signer: NostrSigner) {
    this.signer = signer;
  }
  getPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }
  signEvent(event: Parameters<NostrSigner["signEvent"]>[0]): Promise<NostrEvent> {
    this.count++;
    return this.signer.signEvent(event);
  }
}

/** A blob descriptor response for a fake Blossom server. */
function blobResponse(): Response {
  return new Response(
    JSON.stringify({
      url: "https://example.com/abc.png",
      sha256: "abc",
      size: 3,
      type: "image/png",
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

await test("BlossomUploader signs one auth event for many servers", async () => {
  const signer = new CountingSigner(new NSecSigner(generateSecretKey()));

  const authHeaders: string[] = [];
  const uploader = new BlossomUploader({
    servers: ["https://one.example/", "https://two.example/", "https://three.example/"],
    signer,
    fetch: (_url, init) => {
      authHeaders.push((init?.headers as Record<string, string>).authorization);
      return Promise.resolve(blobResponse());
    },
  });

  await uploader.upload(new File(["abc"], "abc.png", { type: "image/png" }));

  // One signature reused across all three servers.
  deepStrictEqual(signer.count, 1);
  deepStrictEqual(new Set(authHeaders).size, 1);

  // The reused authorization carries no `server` tag.
  const event = N64.decodeEvent(authHeaders[0].replace(/^Nostr /, ""));
  deepStrictEqual(event.tags.some(([name]) => name === "server"), false);
});

await test("BlossomUploader signs per-server auth when scopeToServer is set", async () => {
  const signer = new CountingSigner(new NSecSigner(generateSecretKey()));

  const servers = new Set<string>();
  const uploader = new BlossomUploader({
    servers: ["https://one.example/", "https://two.example/", "https://three.example/"],
    signer,
    scopeToServer: true,
    fetch: (_url, init) => {
      const token = (init?.headers as Record<string, string>).authorization.replace(/^Nostr /, "");
      const event = N64.decodeEvent(token);
      servers.add(event.tags.find(([name]) => name === "server")?.[1] ?? "");
      return Promise.resolve(blobResponse());
    },
  });

  await uploader.upload(new File(["abc"], "abc.png", { type: "image/png" }));

  // One signature per server, each scoped to its own domain.
  deepStrictEqual(signer.count, 3);
  deepStrictEqual(servers, new Set(["one.example", "two.example", "three.example"]));
});

await test(
  "BlossomUploader.upload",
  { skip: process.env.CI === "true" || process.env.CI === "1" },
  async () => {
    const fsFile = await fs.open(
      new URL("../../../fixtures/voadi.png", import.meta.url),
    );
    const blob = await (new Response(Readable.toWeb(fsFile.createReadStream())))
      .blob();
    const file = new File([blob], "voadi.png", { type: "image/png" });

    const uploader = new BlossomUploader({
      servers: ["https://blossom.primal.net/"],
      signer: new NSecSigner(generateSecretKey()),
    });

    const tags = await uploader.upload(file);

    deepStrictEqual(tags, [
      [
        "url",
        "https://blossom.primal.net/7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539.png",
      ],
      ["x", "7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539"],
      [
        "ox",
        "7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539",
      ],
      ["size", "172"],
      ["m", "image/png"],
    ]);
  },
);
