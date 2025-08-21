// deno-lint-ignore-file require-await require-yield
import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/types';

/** A relay storage class that intentionally throws errors for every method. */
export class ErrorRelay implements NRelay {
  async *req(
    _filters: NostrFilter[],
    _opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    throw new Error('This error is intentional.');
  }

  async event(
    _event: NostrEvent,
    _opts?: { signal?: AbortSignal },
  ): Promise<void> {
    throw new Error('This error is intentional.');
  }

  async query(
    _filters: NostrFilter[],
    _opts?: { signal?: AbortSignal },
  ): Promise<NostrEvent[]> {
    throw new Error('This error is intentional.');
  }

  async count(
    _filters: NostrFilter[],
    _opts?: { signal?: AbortSignal },
  ): Promise<NostrRelayCOUNT[2]> {
    throw new Error('This error is intentional.');
  }

  async remove(
    _filters: NostrFilter[],
    _opts?: { signal?: AbortSignal },
  ): Promise<void> {
    throw new Error('This error is intentional.');
  }

  async close(): Promise<void> {
    throw new Error('This error is intentional.');
  }
}
