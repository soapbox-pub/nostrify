---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: Nostrify
  text: Framework for Nostr on Deno and web.
  tagline: Bring your projects to life on Nostr. 🌱
  image: '/ufo-ostrich.svg'
  actions:
    - theme: brand
      text: Get Started
      link: /start/
    - theme: alt
      text: Source Code
      link: https://gitlab.com/soapbox-pub/nostrify

features:
  - icon: 🛰️
    title: Relays
    details: Automatically reconnect and gather events efficiently from pools.
    link: /relay/
  - icon: 📦
    title: Storages
    details: Store events in memory, SQL databases, and relays all using the same interface.
    link: /store/
  - icon: ✒️
    title: Signers
    details: Sign events with a private key, hardware wallet, remote signer, and more.
    link: /sign/
  - icon: 📜
    title: Schemas
    details: Parse Nostr events, relay messages, and other untrusted sources.
    link: /schema/
  - icon: 👩‍⚖️
    title: Moderation Policies
    details: Reject events in clients and relays based on custom rules.
    link: /policy/
  - icon: 🖼️
    title: Uploaders
    details: Upload files to Blossom, nostr.build, and more.
    link: /upload/
  - icon: 🫂
    title: Integrations
    details: Use with nostr-tools, NDK, or add to your existing project.
    link: /integrations/
  - icon: 💡
    title: Simple
    details: Small modules that do one thing well. Create your own!
---

