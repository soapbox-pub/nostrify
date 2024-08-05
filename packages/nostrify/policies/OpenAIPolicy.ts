import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/**
 * OpenAI moderation result.
 *
 * https://platform.openai.com/docs/api-reference/moderations/create
 */
interface OpenAIModerationResult {
  id: string;
  model: string;
  results: {
    categories: {
      'hate': boolean;
      'hate/threatening': boolean;
      'self-harm': boolean;
      'sexual': boolean;
      'sexual/minors': boolean;
      'violence': boolean;
      'violence/graphic': boolean;
    };
    category_scores: {
      'hate': number;
      'hate/threatening': number;
      'self-harm': number;
      'sexual': number;
      'sexual/minors': number;
      'violence': number;
      'violence/graphic': number;
    };
    flagged: boolean;
  }[];
}

/** Policy options for `OpenAIPolicy`. */
interface OpenAIPolicyOpts {
  /**
   * Callback for fine control over the policy. It contains the event and the OpenAI moderation data.
   * Implementations should return `true` to **reject** the content, and `false` to accept.
   */
  handler?(event: NostrEvent, result: OpenAIModerationResult): boolean;
  /** Custom endpoint to use instead of `https://api.openai.com/v1/moderations`. */
  endpoint?: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
  /** Timeout for the fetch request. */
  timeout?: number;
  /** Which event kinds to apply the policy to. */
  kinds?: number[];
  /** OpenAI API key for making the requests. */
  apiKey: string;
}

/**
 * Passes event content to OpenAI and then rejects flagged events.
 *
 * By default, this policy will reject kind 1 events that OpenAI flags.
 * It's possible to pass a custom handler for more control. An OpenAI API key is required.
 *
 * ```ts
 * // Default handler. It's so strict it's suitable for children.
 * new OpenAIPolicy({ apiKey: Deno.env.get('OPENAI_API_KEY') });
 *
 * // With a custom handler.
 * new OpenAIPolicy({
 *   apiKey: Deno.env.get('OPENAI_API_KEY'),
 *   handler(event, data) {
 *     // Loop each result.
 *     return data.results.some((result) => {
 *       if (result.flagged) {
 *         const { sexual, violence } = result.categories;
 *         // Reject only events flagged as sexual and violent.
 *         return sexual && violence;
 *       }
 *     });
 *   },
 * });
 * ```
 */
export class OpenAIPolicy implements NPolicy {
  constructor(private opts: OpenAIPolicyOpts) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const {
      handler = (_, { results }) => results.some((r) => r.flagged),
      endpoint = 'https://api.openai.com/v1/moderations',
      timeout = 1000,
      kinds = [1, 30023],
      apiKey,
    } = this.opts;

    if (kinds.includes(event.kind)) {
      try {
        const resp = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: event.content,
          }),
          signal: AbortSignal.timeout(timeout),
        });

        const result = await resp.json();

        if (handler(event, result)) {
          return ['OK', event.id, false, 'blocked: content flagged by AI'];
        }
      } catch (_) {
        return ['OK', event.id, false, 'blocked: error analyzing content'];
      }
    }

    return ['OK', event.id, true, ''];
  }
}
