/** NIP-11 Relay Information Document: https://github.com/nostr-protocol/nips/blob/master/11.md */
export interface NostrRelayInfo {
  /**
   * A relay may select a `name` for use in client software.
   * This is a string, and SHOULD be less than 30 characters to avoid client truncation.
   */
  name?: string;
  /**
   * Detailed plain-text information about the relay may be contained in the `description` string.
   * It is recommended that this contain no markup, formatting or line breaks for word wrapping, and simply use double newline characters to separate paragraphs.
   * There are no limitations on length.
   */
  description?: string;
  /**
   * An administrative contact may be listed with a `pubkey`, in the same format as Nostr events (32-byte hex for a `secp256k1` public key).
   * If a contact is listed, this provides clients with a recommended address to send encrypted direct messages (See [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md)) to a system administrator.
   * Expected uses of this address are to report abuse or illegal content, file bug reports, or request other technical assistance.
   *
   * Relay operators have no obligation to respond to direct messages.
   */
  pubkey?: string;
  /**
   * An alternative contact may be listed under the `contact` field as well, with the same purpose as `pubkey`.
   * Use of a Nostr public key and direct message SHOULD be preferred over this.
   * Contents of this field SHOULD be a URI, using schemes such as `mailto` or `https` to provide users with a means of contact.
   */
  contact?: string;
  /**
   * As the Nostr protocol evolves, some functionality may only be available by relays that implement a specific `NIP`.
   * This field is an array of the integer identifiers of `NIP`s that are implemented in the relay.
   * Examples would include `1`, for `"NIP-01"` and `9`, for `"NIP-09"`.
   * Client-side `NIPs` SHOULD NOT be advertised, and can be ignored by clients.
   */
  supported_nips?: number[];
  /**
   * The relay server implementation MAY be provided in the `software` attribute.
   * If present, this MUST be a URL to the project's homepage.
   */
  software?: string;
  /**
   * The relay MAY choose to publish its software version as a string attribute.
   * The string format is defined by the relay implementation.
   * It is recommended this be a version number or commit identifier.
   */
  version?: string;
  /**
   * These are limitations imposed by the relay on clients.
   * Your client should expect that requests which exceed these *practical* limitations are rejected or fail immediately.
   */
  limitation?: {
    /**
     * This is the maximum number of bytes for incoming JSON that the relay will attempt to decode and act upon.
     * When you send large subscriptions, you will be limited by this value.
     * It also effectively limits the maximum size of any event.
     * Value is calculated from `[` to `]` and is after UTF-8 serialization (so some unicode characters will cost 2-3 bytes).
     * It is equal to the maximum size of the WebSocket message frame.
     */
    max_message_length?: number;
    /**
     * Total number of subscriptions that may be active on a single websocket connection to this relay.
     * It's possible that authenticated clients with a (paid) relationship to the relay may have higher limits.
     */
    max_subscriptions?: number;
    /** Maximum number of filter values in each subscription. Must be one or higher. */
    max_filters?: number;
    /**
     * The relay server will clamp each filter's `limit` value to this number.
     * This means the client won't be able to get more than this number of events from a single subscription filter.
     * This clamping is typically done silently by the relay, but with this number, you can know that there are additional results if you narrowed your filter's time range or other parameters.
     */
    max_limit?: number;
    /** Maximum length of subscription id as a string. */
    max_subid_length?: number;
    /** In any event, this is the maximum number of elements in the `tags` list. */
    max_event_tags?: number;
    /**
     * Maximum number of characters in the `content` field of any event.
     * This is a count of unicode characters.
     * After serializing into JSON it may be larger (in bytes), and is still subject to the `max_message_length`, if defined.
     */
    max_content_length?: number;
    /** New events will require at least this difficulty of PoW, based on [NIP-13](https://github.com/nostr-protocol/nips/blob/master/13.md), or they will be rejected by this server. */
    min_pow_difficulty?: number;
    /**
     * This relay requires [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) authentication to happen before a new connection may perform any other action.
     * Even if set to False, authentication may be required for specific actions.
     */
    auth_required?: boolean;
    /** This relay requires payment before a new connection may perform any action. */
    payment_required?: boolean;
    /**
     * This relay requires some kind of condition to be fulfilled in order to accept events (not necessarily, but including `payment_required` and `min_pow_difficulty`).
     * This should only be set to `true` when users are expected to know the relay policy before trying to write to it -- like belonging to a special pubkey-based whitelist or writing only events of a specific niche kind or content.
     * Normal anti-spam heuristics, for example, do not qualify.
     */
    restricted_writes?: boolean;
    /** `created_at` lower limit. */
    created_at_lower_limit?: number;
    /** `created_at` upper limit. */
    created_at_upper_limit?: number;
    [key: string]: unknown;
  };
  /** Event Retention. */
  retention?: Array<{ time: number | null; count?: number; kinds?: number[] }>;
  /** A list of two-level ISO country codes (ISO 3166-1 alpha-2) whose laws and policies may affect this relay. `EU` may be used for European Union countries. */
  relay_countries?: string[];
  /** An ordered list of [IETF language tags](https://en.wikipedia.org/wiki/IETF_language_tag) indicating the major languages spoken on the relay. */
  language_tags?: string[];
  /**
   * A list of limitations on the topics to be discussed.
   * For example `sfw-only` indicates that only "Safe For Work" content is encouraged on this relay.
   * This relies on assumptions of what the "work" "community" feels "safe" talking about.
   * In time, a common set of tags may emerge that allow users to find relays that suit their needs, and client software will be able to parse these tags easily.
   * The `bitcoin-only` tag indicates that any *altcoin, "crypto" or blockchain* comments will be ridiculed without mercy.
   */
  tags?: string[];
  /**
   * A link to a human-readable page which specifies the community policies for the relay.
   * In cases where `sfw-only` is true, it's important to link to a page which gets into the specifics of your posting policy.
   */
  posting_policy?: string;
  payments_url?: string;
  fees?: Record<string, Array<{ amount: number; unit: string; period?: number; kinds?: number[] }>>;
  /** A URL pointing to an image to be used as an icon for the relay. Recommended to be squared in shape. */
  icon?: string;
  [key: string]: unknown;
}
