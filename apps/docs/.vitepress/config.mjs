import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Finance OS',
  description: 'Open-source, AI-agent-native personal finance engine',
  cleanUrls: true,

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=JetBrains+Mono:wght@400;500;600&display=swap', rel: 'stylesheet' }],
    ['link', { href: 'https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600&display=swap', rel: 'stylesheet' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Finance OS',

    nav: [
      { text: 'Guide', link: '/getting-started/introduction' },
      { text: 'API', link: '/api/overview' },
      { text: 'MCP', link: '/ai-integration/mcp-server' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/getting-started/introduction' },
          { text: 'Quickstart', link: '/getting-started/quickstart' },
          { text: 'Self-Hosting', link: '/getting-started/self-hosting' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Wallets', link: '/guides/wallets' },
          { text: 'Transactions', link: '/guides/transactions' },
          { text: 'Importing Data', link: '/guides/importing-data' },
          { text: 'Categories', link: '/guides/categories' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/overview' },
          { text: 'Endpoints', link: '/api/endpoints' },
          { text: 'Authentication', link: '/api/authentication' },
        ],
      },
      {
        text: 'AI Integration',
        items: [
          { text: 'MCP Server', link: '/ai-integration/mcp-server' },
          { text: 'CLI', link: '/ai-integration/cli' },
          { text: 'Skills', link: '/ai-integration/skills' },
        ],
      },
      {
        text: 'Contributing',
        items: [
          { text: 'Development Setup', link: '/contributing/development-setup' },
          { text: 'Architecture', link: '/contributing/architecture' },
          { text: 'Coding Standards', link: '/contributing/coding-standards' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/izzatr/finance-os' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/izzatr/finance-os/edit/main/apps/docs/:path',
    },

    footer: {
      message: 'Released under the AGPL-3.0 License.',
      copyright: 'Copyright 2026 Izzat Raihan',
    },
  },
})
