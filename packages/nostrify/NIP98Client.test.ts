// deno-lint-ignore-file require-await
import { test } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { generateSecretKey } from "nostr-tools";

import { NIP98Client } from "./NIP98Client.ts";
import { NSecSigner } from "./NSecSigner.ts";
import { N64 } from "./utils/N64.ts";
import { NIP98 } from "./NIP98.ts";

await test("NIP98Client.fetch - basic GET request", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  // Mock fetch function to capture the request
  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("success", { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const response = await client.fetch("https://example.com/api");

  deepStrictEqual(response.status, 200);
  deepStrictEqual(await response.text(), "success");

  // Verify the Authorization header was added
  const authHeader = capturedRequest?.headers.get("Authorization");
  ok(authHeader && authHeader.includes("Nostr "));

  // Verify the token can be decoded and is valid
  const token = authHeader!.replace("Nostr ", "");
  const event = N64.decodeEvent(token);

  deepStrictEqual(event.kind, 27235);
  deepStrictEqual(event.pubkey, await signer.getPublicKey());

  // Verify the event tags contain the correct method and URL
  const methodTag = event.tags.find(([name]) => name === "method");
  const urlTag = event.tags.find(([name]) => name === "u");

  deepStrictEqual(methodTag?.[1], "GET");
  deepStrictEqual(urlTag?.[1], "https://example.com/api");
});

await test("NIP98Client.fetch - POST request with body", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("created", { status: 201 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const requestBody = JSON.stringify({ message: "Hello, world!" });
  const response = await client.fetch("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  deepStrictEqual(response.status, 201);
  deepStrictEqual(await response.text(), "created");

  // Verify the Authorization header was added
  const authHeader = capturedRequest?.headers.get("Authorization");
  ok(authHeader && authHeader.includes("Nostr "));

  // Verify the token contains payload hash for POST request
  const token = authHeader!.replace("Nostr ", "");
  const event = N64.decodeEvent(token);

  deepStrictEqual(event.kind, 27235);

  const methodTag = event.tags.find(([name]) => name === "method");
  const urlTag = event.tags.find(([name]) => name === "u");
  const payloadTag = event.tags.find(([name]) => name === "payload");

  deepStrictEqual(methodTag?.[1], "POST");
  deepStrictEqual(urlTag?.[1], "https://example.com/api");
  deepStrictEqual(typeof payloadTag?.[1], "string"); // Should have payload hash
});

await test("NIP98Client.fetch - with Request object input", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("ok", { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const originalRequest = new Request("https://example.com/test", {
    method: "PUT",
    headers: { "Custom-Header": "custom-value" },
    body: "test data",
  });

  const response = await client.fetch(originalRequest);

  deepStrictEqual(response.status, 200);

  // Verify original headers are preserved
  deepStrictEqual(
    capturedRequest?.headers.get("Custom-Header"),
    "custom-value",
  );

  // Verify Authorization header was added
  const authHeader = capturedRequest?.headers.get("Authorization");
  ok(authHeader && authHeader.includes("Nostr "));

  // Verify the event details
  const token = authHeader!.replace("Nostr ", "");
  const event = N64.decodeEvent(token);

  const methodTag = event.tags.find(([name]) => name === "method");
  const urlTag = event.tags.find(([name]) => name === "u");

  deepStrictEqual(methodTag?.[1], "PUT");
  deepStrictEqual(urlTag?.[1], "https://example.com/test");
});

await test("NIP98Client.fetch - with URL object input", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("ok", { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const url = new URL("https://example.com/url-test");
  const response = await client.fetch(url, { method: "DELETE" });

  deepStrictEqual(response.status, 200);

  const authHeader = capturedRequest?.headers.get("Authorization");
  const token = authHeader!.replace("Nostr ", "");
  const event = N64.decodeEvent(token);

  const methodTag = event.tags.find(([name]) => name === "method");
  const urlTag = event.tags.find(([name]) => name === "u");

  deepStrictEqual(methodTag?.[1], "DELETE");
  deepStrictEqual(urlTag?.[1], "https://example.com/url-test");
});

await test("NIP98Client.fetch - uses default fetch when not provided", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  // Mock the global fetch to verify it's called
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fetchCalled = true;
    const request = new Request(input, init);

    // Verify the Authorization header is present
    const authHeader = request.headers.get("Authorization");
    ok(authHeader && authHeader.includes("Nostr "));

    return new Response("default fetch used", { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    const client = new NIP98Client({ signer });
    const response = await client.fetch("https://example.com/default");

    deepStrictEqual(fetchCalled, true);
    deepStrictEqual(response.status, 200);
    deepStrictEqual(await response.text(), "default fetch used");
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

await test("NIP98Client.fetch - preserves existing headers", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("ok", { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  await client.fetch("https://example.com/headers", {
    headers: {
      "User-Agent": "test-agent",
      "Accept": "application/json",
      "X-Custom": "custom-value",
    },
  });

  // Verify all original headers are preserved
  deepStrictEqual(capturedRequest?.headers.get("User-Agent"), "test-agent");
  deepStrictEqual(capturedRequest?.headers.get("Accept"), "application/json");
  deepStrictEqual(capturedRequest?.headers.get("X-Custom"), "custom-value");

  // Verify Authorization header was added
  ok(capturedRequest?.headers.get("Authorization")?.includes("Nostr "));
});

await test("NIP98Client.fetch - event can be verified with NIP98.verify", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response("verified", { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  await client.fetch("https://example.com/verify", {
    method: "POST",
    body: "test payload",
  });

  // Verify the request can be verified using NIP98.verify
  const verifiedEvent = await NIP98.verify(capturedRequest!);

  deepStrictEqual(verifiedEvent.kind, 27235);
  deepStrictEqual(verifiedEvent.pubkey, await signer.getPublicKey());

  const methodTag = verifiedEvent.tags.find(([name]) => name === "method");
  const urlTag = verifiedEvent.tags.find(([name]) => name === "u");

  deepStrictEqual(methodTag?.[1], "POST");
  deepStrictEqual(urlTag?.[1], "https://example.com/verify");
});

await test("NIP98Client.fetch - handles different HTTP methods", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  for (const method of methods) {
    let capturedRequest: Request | undefined;
    const mockFetch: typeof globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      capturedRequest = request.clone();
      return new Response("ok", { status: 200 });
    };

    const client = new NIP98Client({ signer, fetch: mockFetch });

    await client.fetch(`https://example.com/${method.toLowerCase()}`, {
      method,
      body: ["POST", "PUT", "PATCH"].includes(method) ? "test body" : undefined,
    });

    const authHeader = capturedRequest?.headers.get("Authorization");
    const token = authHeader!.replace("Nostr ", "");
    const event = N64.decodeEvent(token);

    const methodTag = event.tags.find(([name]) => name === "method");
    deepStrictEqual(
      methodTag?.[1],
      method,
      `Method tag should match for ${method}`,
    );

    // Check if payload tag is present for methods that should have it
    const payloadTag = event.tags.find(([name]) => name === "payload");
    if (["POST", "PUT", "PATCH"].includes(method)) {
      deepStrictEqual(
        typeof payloadTag?.[1],
        "string",
        `Payload tag should be present for ${method}`,
      );
    }
  }
});
