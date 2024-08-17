# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
