---
"@nostrify/nostrify": patch
"@nostrify/policies": patch
"@nostrify/seed": patch
"@nostrify/db": patch
---

Drop dependencies that were never needed at runtime.

`@nostrify/nostrify` pulled in `@smithy/util-base64` and `@smithy/util-hex-encoding`
— AWS SDK internals — for four function calls. `@scure/base` was already a direct
dependency and does the same job, so the imports now come from there and five packages
leave the tree.

`@nostrify/db` listed `postgres` and `kysely-postgres-js` as dependencies, but
`NPostgres` only ever imports `kysely`; the Postgres driver was reaching every consumer
to serve the test suite. Both are devDependencies now, as is `@types/node` in
`@nostrify/policies` and `@nostrify/seed`, neither of which references node types from
its published declarations.

No API changes. `N64.decodeEvent` renames its parameter and, because `@scure/base`
validates more strictly than `@smithy` did, reports malformed base64 with a different
message than before.
