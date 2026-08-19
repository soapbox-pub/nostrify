---
'@nostrify/policies': patch
---

`HashtagPolicy`: don't throw on a tag with no value, and compare case-insensitively
on both sides. An event carrying a bare `["t"]` tag crashed the policy with a
`TypeError`, and a ban list entry containing uppercase never matched anything.

`RegexPolicy`: strip the `g` and `y` flags from the supplied regex. `RegExp.test`
advances `lastIndex` on those flags and resumes from it on the next call, so a
policy built with e.g. `/spam/g` blocked the first matching event, allowed the
second, and blocked the third.
