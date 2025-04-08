export class NKinds {
  /** Events are **regular**, which means they're all expected to be stored by relays. */
  static regular(kind: number): boolean {
    return (1000 <= kind && kind < 10000) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(kind);
  }

  /** Events are **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event is expected to (SHOULD) be stored by relays, older versions are expected to be discarded. */
  static replaceable(kind: number): boolean {
    return (10000 <= kind && kind < 20000) || [0, 3].includes(kind);
  }

  /** Events are **ephemeral**, which means they are not expected to be stored by relays. */
  static ephemeral(kind: number): boolean {
    return 20000 <= kind && kind < 30000;
  }

  /** Events are **addressable**, which means that, for each combination of `pubkey`, `kind` and the `d` tag, only the latest event is expected to be stored by relays, older versions are expected to be discarded. */
  static addressable(kind: number): boolean {
    return 30000 <= kind && kind < 40000;
  }

  /** @deprecated Use `NKinds.addressable()` instead. */
  static parameterizedReplaceable(kind: number): boolean {
    return NKinds.addressable(kind);
  }
}
