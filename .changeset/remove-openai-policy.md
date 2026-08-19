---
'@nostrify/policies': major
---

Remove `OpenAIPolicy`.

The policy passed a `body` to `fetch` without setting `method`, so every request
was a GET with a body — which `fetch` rejects with a `TypeError` before the
request is ever sent. The surrounding `try`/`catch` turned that into
`blocked: error analyzing content`, so the policy rejected 100% of the events it
was configured to inspect. It also ignored the `fetch` option it documented,
always calling the global.
