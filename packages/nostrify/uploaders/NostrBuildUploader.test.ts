import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import process from "node:process";
import { URL } from "node:url";
import fs from "node:fs/promises";

import { NostrBuildUploader } from "./NostrBuildUploader.ts";
import { Readable } from "node:stream";
import { NSecSigner } from "../NSecSigner.ts";
import { hexToBytes } from "nostr-tools/utils";

await test(
  "NostrBuildUploader.upload",
  { skip: process.env.CI === "true" || process.env.CI === "1" },
  async () => {
    const fsFile = await fs.open(
      new URL("../../../fixtures/voadi.png", import.meta.url),
    );
    const blob = await (new Response(Readable.toWeb(fsFile.createReadStream())))
      .blob();
    const file = new File([blob], "voadi.png", { type: "image/png" });

    const seckey = process.env.NOSTRIFY_NBU_SECRET_KEY;
    if (!seckey) {
      throw new Error(
        "nostr.build with default uploader requires a secret key to be configured",
      );
    }

    const uploader = new NostrBuildUploader({
      signer: new NSecSigner(
        hexToBytes(
          seckey,
        ),
      ),
    });
    const tags = await uploader.upload(file);

    deepStrictEqual(tags, [
      [
        "url",
        "https://image.nostr.build/7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539.png",
      ],
      ["m", "image/png"],
      ["x", "21608eecb7df80ca3838deb428fd6568a0d0d3b1baac56491e2247a1c110649a"],
      [
        "ox",
        "7508bd9d8b0ed6e0891a3b973adf6011b1e49f6174910d6a1eb722a4a2e30539",
      ],
      ["size", "171"],
      ["dim", "16x16"],
      ["blurhash", "LCB20ssn0+NcbsfjRmaz12WW}osn"],
    ]);
  },
);
