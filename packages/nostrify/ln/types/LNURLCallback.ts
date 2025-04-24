/** LNURL callback response, as defined by LUD-06. */
export interface LNURLCallback {
  /** bech32-serialized lightning invoice. */
  pr: `lnbc1${string}`;
  /** An empty array. */
  routes: [];
}
