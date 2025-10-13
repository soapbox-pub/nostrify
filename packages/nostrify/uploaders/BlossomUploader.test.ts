import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { generateSecretKey } from "nostr-tools";
import process from "node:process";
import { BlossomUploader } from "./BlossomUploader.ts";
import { NSecSigner } from "../NSecSigner.ts";
import fs from "node:fs/promises";
import { URL } from "node:url";
import { Readable } from "node:stream";

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
