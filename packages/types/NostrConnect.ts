/** NIP-46 [request](https://github.com/nostr-protocol/nips/blob/master/46.md#request-events-kind-24133) content. */
export interface NostrConnectRequest {
  /* Random string that is a request ID. This same ID will be sent back in the response payload. */
  id: string;
  /** Name of the method/command. */
  method: string;
  /** positional array of string parameters. */
  params: string[];
}

/** NIP-46 [response](https://github.com/nostr-protocol/nips/blob/master/46.md#response-events-kind24133) content. */
export interface NostrConnectResponse {
  /** Request ID that this response is for. */
  id: string;
  /** Result of the call (this can be either a string or a JSON stringified object) */
  result: string;
  /** Error in string form, if any. Its presence indicates an error with the request. */
  error?: string;
}
