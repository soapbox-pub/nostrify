# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.38.0 - 2025-02-05

### Added

- NPostgres: support negative NIP-50 search tokens.

## 0.37.3 - 2025-02-02

### Fixed

- NPostgres: NIP-50 different keys AND, same keys OR.

## 0.37.2 - 2025-02-02

### Fixed

- NPostgres: fix regular search text in NIP-50 queries.

## 0.37.1 - 2025-02-02

### Fixed

- NPostgres: indexExtensions being called in a transaction.

## 0.37.0 - 2025-02-02

### Added

- NPostgres: NIP-50 search extensions.

## 0.36.2 - 2025-01-25

### Fixed

- NPostgres: speed up queries of replaceable events by restoring conditional sort.

## 0.36.1 - 2024-10-07

### Changed

- NPostgres: return all columns in query, let parseEventRow decide which to take.

## 0.36.0 - 2024-10-07

### Changed

- NPostgres `parseEventRow` method is protected.

## 0.35.0 - 2024-09-23

### Added

- Added `.close()` methods to NDatabase and NPostgres.

## 0.32.2 - 2024-09-15

- NPostgres: select from nostr_events.*

## 0.32.1 - 2024-09-15

- NPostgres: prefixed columns with table name in getEventsQuery.

## 0.32.0 - 2024-09-15

### Fixed

- NPostgres: prefixed columns with table name in queries.
- NPostgres: fixed return type of `.count`

### Added

- NPostgres: add checks to ensure tags are arrays, tags_index is object.

### Removed

- BREAKING: NDatabase: remove `timeout` opt.
- BREAKING: NDatabase: remove extra tag columns.
- BREAKING: NDatabase: remove Postgres FTS support.

## 0.31.2 - 2024-08-12

### Fixed

- NPostgres: only set the `d` tag on parameterized events.

## 0.31.1 - 2024-08-10

### Fixed

- NPostgres: don't order-by in COUNT.
- NPostgres: fix `.remove` with multiple filters.

## 0.31.0 - 2024-08-10

### Added

- Added first version of NPostgres.

### Fixed

- Added tsdocs to all symbols.

## 0.30.0 - 2024-08-05

### Added

- Initial release as a standalone package. Previously part of `jsr:@nostrify/nostrify`.
- Added replaceable events index.
