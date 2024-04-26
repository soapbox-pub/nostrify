/** LNURL callback response, as defined by LUD-06. */
export interface LNURLCallback {
  /** bech32-serialized lightning invoice. */
  pr: string;
  /** An empty array. */
  routes: [];
}
