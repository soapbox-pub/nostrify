// deno-lint-ignore-file require-await
import { assertEquals, assertStringIncludes } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { NIP98Client } from './NIP98Client.ts';
import { NSecSigner } from './NSecSigner.ts';
import { N64 } from './utils/N64.ts';
import { NIP98 } from './NIP98.ts';

Deno.test('NIP98Client.fetch - basic GET request', async () => {
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
    return new Response('success', { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const response = await client.fetch('https://example.com/api');

  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'success');

  // Verify the Authorization header was added
  const authHeader = capturedRequest?.headers.get('Authorization');
  assertStringIncludes(authHeader!, 'Nostr ');

  // Verify the token can be decoded and is valid
  const token = authHeader!.replace('Nostr ', '');
  const event = N64.decodeEvent(token);

  assertEquals(event.kind, 27235);
  assertEquals(event.pubkey, await signer.getPublicKey());

  // Verify the event tags contain the correct method and URL
  const methodTag = event.tags.find(([name]) => name === 'method');
  const urlTag = event.tags.find(([name]) => name === 'u');

  assertEquals(methodTag?.[1], 'GET');
  assertEquals(urlTag?.[1], 'https://example.com/api');
});

Deno.test('NIP98Client.fetch - POST request with body', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response('created', { status: 201 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const requestBody = JSON.stringify({ message: 'Hello, world!' });
  const response = await client.fetch('https://example.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  });

  assertEquals(response.status, 201);
  assertEquals(await response.text(), 'created');

  // Verify the Authorization header was added
  const authHeader = capturedRequest?.headers.get('Authorization');
  assertStringIncludes(authHeader!, 'Nostr ');

  // Verify the token contains payload hash for POST request
  const token = authHeader!.replace('Nostr ', '');
  const event = N64.decodeEvent(token);

  assertEquals(event.kind, 27235);

  const methodTag = event.tags.find(([name]) => name === 'method');
  const urlTag = event.tags.find(([name]) => name === 'u');
  const payloadTag = event.tags.find(([name]) => name === 'payload');

  assertEquals(methodTag?.[1], 'POST');
  assertEquals(urlTag?.[1], 'https://example.com/api');
  assertEquals(typeof payloadTag?.[1], 'string'); // Should have payload hash
});

Deno.test('NIP98Client.fetch - with Request object input', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response('ok', { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const originalRequest = new Request('https://example.com/test', {
    method: 'PUT',
    headers: { 'Custom-Header': 'custom-value' },
    body: 'test data',
  });

  const response = await client.fetch(originalRequest);

  assertEquals(response.status, 200);

  // Verify original headers are preserved
  assertEquals(capturedRequest?.headers.get('Custom-Header'), 'custom-value');

  // Verify Authorization header was added
  const authHeader = capturedRequest?.headers.get('Authorization');
  assertStringIncludes(authHeader!, 'Nostr ');

  // Verify the event details
  const token = authHeader!.replace('Nostr ', '');
  const event = N64.decodeEvent(token);

  const methodTag = event.tags.find(([name]) => name === 'method');
  const urlTag = event.tags.find(([name]) => name === 'u');

  assertEquals(methodTag?.[1], 'PUT');
  assertEquals(urlTag?.[1], 'https://example.com/test');
});

Deno.test('NIP98Client.fetch - with URL object input', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response('ok', { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  const url = new URL('https://example.com/url-test');
  const response = await client.fetch(url, { method: 'DELETE' });

  assertEquals(response.status, 200);

  const authHeader = capturedRequest?.headers.get('Authorization');
  const token = authHeader!.replace('Nostr ', '');
  const event = N64.decodeEvent(token);

  const methodTag = event.tags.find(([name]) => name === 'method');
  const urlTag = event.tags.find(([name]) => name === 'u');

  assertEquals(methodTag?.[1], 'DELETE');
  assertEquals(urlTag?.[1], 'https://example.com/url-test');
});

Deno.test('NIP98Client.fetch - uses default fetch when not provided', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  // Mock the global fetch to verify it's called
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    fetchCalled = true;
    const request = new Request(input, init);

    // Verify the Authorization header is present
    const authHeader = request.headers.get('Authorization');
    assertStringIncludes(authHeader!, 'Nostr ');

    return new Response('default fetch used', { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    const client = new NIP98Client({ signer });
    const response = await client.fetch('https://example.com/default');

    assertEquals(fetchCalled, true);
    assertEquals(response.status, 200);
    assertEquals(await response.text(), 'default fetch used');
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test('NIP98Client.fetch - preserves existing headers', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response('ok', { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  await client.fetch('https://example.com/headers', {
    headers: {
      'User-Agent': 'test-agent',
      'Accept': 'application/json',
      'X-Custom': 'custom-value',
    },
  });

  // Verify all original headers are preserved
  assertEquals(capturedRequest?.headers.get('User-Agent'), 'test-agent');
  assertEquals(capturedRequest?.headers.get('Accept'), 'application/json');
  assertEquals(capturedRequest?.headers.get('X-Custom'), 'custom-value');

  // Verify Authorization header was added
  assertStringIncludes(capturedRequest?.headers.get('Authorization')!, 'Nostr ');
});

Deno.test('NIP98Client.fetch - event can be verified with NIP98.verify', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  let capturedRequest: Request | undefined;
  const mockFetch: typeof globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    capturedRequest = request.clone();
    return new Response('verified', { status: 200 });
  };

  const client = new NIP98Client({ signer, fetch: mockFetch });

  await client.fetch('https://example.com/verify', {
    method: 'POST',
    body: 'test payload',
  });

  // Verify the request can be verified using NIP98.verify
  const verifiedEvent = await NIP98.verify(capturedRequest!);

  assertEquals(verifiedEvent.kind, 27235);
  assertEquals(verifiedEvent.pubkey, await signer.getPublicKey());

  const methodTag = verifiedEvent.tags.find(([name]) => name === 'method');
  const urlTag = verifiedEvent.tags.find(([name]) => name === 'u');

  assertEquals(methodTag?.[1], 'POST');
  assertEquals(urlTag?.[1], 'https://example.com/verify');
});

Deno.test('NIP98Client.fetch - handles different HTTP methods', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  for (const method of methods) {
    let capturedRequest: Request | undefined;
    const mockFetch: typeof globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      capturedRequest = request.clone();
      return new Response('ok', { status: 200 });
    };

    const client = new NIP98Client({ signer, fetch: mockFetch });

    await client.fetch(`https://example.com/${method.toLowerCase()}`, {
      method,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? 'test body' : undefined,
    });

    const authHeader = capturedRequest?.headers.get('Authorization');
    const token = authHeader!.replace('Nostr ', '');
    const event = N64.decodeEvent(token);

    const methodTag = event.tags.find(([name]) => name === 'method');
    assertEquals(methodTag?.[1], method, `Method tag should match for ${method}`);

    // Check if payload tag is present for methods that should have it
    const payloadTag = event.tags.find(([name]) => name === 'payload');
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      assertEquals(typeof payloadTag?.[1], 'string', `Payload tag should be present for ${method}`);
    }
  }
});
