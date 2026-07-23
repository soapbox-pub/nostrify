---
"@nostrify/indexeddb": minor
---

Add NIP-50 full-text search to `NIndexedDB`. `search` filters are parsed per NIP-50 — extension tokens (`key:value`) are parsed and removed — and the remaining keywords are matched against event content case-insensitively (all keywords must appear; `-keyword` excludes). Search scans page candidates through the planned index in fixed-size chunks, newest-first, matching until the filter's limit is reached, so memory stays bounded by the chunk size even on a full-store scan.
