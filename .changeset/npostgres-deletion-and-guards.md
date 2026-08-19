---
'@nostrify/db': patch
---

`NPostgres`: fix NIP-09 `a` tag deletion, which deleted more than it was asked
to.

- An address with an empty `d` (`30000:<pubkey>:`) added no `#d` constraint, so
  it deleted *every* event of that kind by the author instead of the one
  addressed.
- `Number('')` is `0`, so an address of `:<pubkey>:` asked to delete the
  author's kind 0.
- An `a` tag naming a regular kind became an unconstrained "delete every event
  of this kind" filter. Only replaceable and addressable kinds have addresses.
- A `d` value containing colons was truncated at the first one.

Also: `count([])` and `remove([])` threw `Reduce of empty array` instead of
returning `0` and doing nothing, and a `timeout` that isn't a non-negative
integer is now rejected — `SET LOCAL` can't bind parameters, and a value that
wasn't a number silently left the query with no timeout at all.
