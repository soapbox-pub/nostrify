import { defineConfig } from 'vitepress';

const GitLabIcon =
  `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-brand-gitlab"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-9 7l-9 -7l3 -11l3 7h6l3 -7z" fill="none" /></svg>`;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Nostrify',
  description: 'Bring your projects to life on Nostr. 🌱',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/ufo.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Relays', link: '/relay/' },
      { text: 'Storages', link: '/store/' },
      { text: 'Signers', link: '/sign/' },
      { text: 'Policies', link: '/policy/' },
      { text: 'Schema', link: '/schema/' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        link: '/start/',
      },
      {
        text: 'Nostr Schema',
        link: '/schema/',
      },
      {
        text: 'Signers',
        link: '/sign/',
        items: [
          { text: 'Private Key', link: '/sign/nsec' },
          { text: 'HD Seed', link: '/sign/seed' },
          { text: 'Nostr Connect', link: '/sign/connect' },
          { text: 'Custodial Signer', link: '/sign/custodial' },
        ],
      },
      {
        text: 'Storages',
        link: '/store/',
        items: [
          { text: 'Memory', link: '/store/memory' },
          { text: 'Postgres', link: '/store/postgres' },
          { text: 'SQL Databases', link: '/store/sql' },
          { text: 'Deno KV', link: '/store/denokv' },
        ],
      },
      {
        text: 'Relays',
        link: '/relay/',
        items: [
          { text: 'Single Relay', link: '/relay/single' },
          { text: 'Relay Pool', link: '/relay/pool' },
          { text: 'Outbox Model', link: '/relay/outbox' },
        ],
      },
      {
        text: 'Moderation Policies',
        link: '/policy/',
        items: [
          { text: 'All Policies', link: '/policy/all' },
          { text: 'Policy Pipelines', link: '/policy/pipe' },
          { text: 'strfry Policies', link: '/policy/strfry' },
        ],
      },
      {
        text: 'Uploaders',
        link: '/upload/',
        items: [
          { text: 'Blossom', link: '/upload/blossom' },
          { text: 'nostr.build', link: '/upload/nostr-build' },
        ],
      },
      {
        text: 'Integrations',
        link: '/integrations/',
        items: [
          { text: 'React', link: '/react' },
          { text: 'Zaps', link: '/zaps' },
          { text: 'MCP', link: '/mcp' },
          { text: 'NDK', link: '/integrations/ndk' },
          { text: 'Welshman', link: '/integrations/welshman' },
        ],
      },
      {
        text: 'API Reference',
        link: 'https://jsr.io/@nostrify/nostrify',
      },
    ],
    socialLinks: [
      { icon: { svg: GitLabIcon }, link: 'https://gitlab.com/soapbox-pub/nostrify' },
    ],
    editLink: {
      pattern: 'https://gitlab.com/soapbox-pub/nostrify-docs/-/blob/main/:path',
    },
    search: {
      provider: 'local',
    },
  },
  head: [
    ['link', { rel: 'icon', href: '/ufo.png' }],
    ['meta', { property: 'og:image', content: 'https://nostrify.dev/banner.png' }],
    ['meta', { name: 'twitter:image', content: 'https://nostrify.dev/banner.png' }],
  ],
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://nostrify.dev',
  },
});
