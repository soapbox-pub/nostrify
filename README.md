# NSpec

Standards-compliant Nostr interfaces and modules in TypeScript.

NSpec offers two things:

1. A types-only package for building your own Nostr tools in a standards-compliant way.
2. Reference implementations of those interfaces, for use in your own projects.

## Standards

Our goal is to create interfaces for Nostr as if they would be implemented by web browsers such as FireFox or Chrome. Each interface must be carefully designed so that it feels natural to both developers of Nostr and developers of JavaScript.

### Guiding principles

- Simplicity is key.
- Interoperability between modules.
- Composability of modules.
- Interoperability with modern JavaScript data structures (`Map`, `Set`, etc).
- Consistent naming conventions.

### Naming conventions

Module prefixes:

- `Nostr-` - Objective Nostr interfaces. These are either defined in NIP-01, or are otherwise widely implemented and accepted within the ecosystem. These interfaces are finalized, and can be freely copied and used in your own projects without depending on this library.

- `N-` - Proposed Nostr interfaces. They are considered ideal, optimal interfaces for the given purpose, but may be subject to change between major versions.

- Others - Support interfaces. These may be exposed for convenience, but may be modified or removed.

## Interfaces

Interfaces are defined in the `interfaces/` directory. They are pure type files, describing parts of a Nostr system to be implemented.

## Reference implementations

The `src/` directory contains NSpec reference implementations, along with other useful tools for working with Nostr. They are suitable for production use as-is, but you can also replace certain modules with your own implementation, and compose them freely to meet your use-case.

## Supported platforms

Packages and installation instructions are on the way.

- Node.js (npm packages coming soon)
- Deno
- Browser

## Work in Progress

NSpec is a work in progress. It is already being used in production projects, but the interfaces are not all finalized. However, it is being actively developed and contributions are welcome.
