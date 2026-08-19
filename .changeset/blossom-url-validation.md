---
'@nostrify/nostrify': patch
---

`BlossomUploader`: require the blob URL to be `http(s)`, both in the BUD-02 blob
descriptor and in the BUD-08 `nip94` tags. The value is chosen by the upload
server and leaves as the `url` tag of an attachment the app is about to put in a
note, so `javascript:` and `data:` URLs are no longer passed along. Also
documented what `scopeToServer` costs when it's off, per BUD-11's security
note: one unscoped token goes to every configured server, and any of them can
replay it against the others until it expires.
