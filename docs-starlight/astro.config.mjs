import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://scenetest.dev',
  integrations: [
    starlight({
      title: 'Scenetest',
      description:
        'Scene-driven, concurrent-actor end-to-end testing for Vite apps, with inline runtime checks and simple multi-actor markdown specs.',
      favicon: '/images/favicon.png',
      customCss: ['./src/styles/custom.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/scenetest/scenetest-js',
        },
      ],
      sidebar: [
        {
          label: 'Guides',
          items: [
            { label: 'Getting Started', slug: 'guides/getting-started' },
            { label: 'Scene Specs', slug: 'guides/writing-scene-specs' },
            {
              label: 'Inline Assertions',
              slug: 'guides/writing-inline-assertions',
            },
            { label: 'Teams of Actors', slug: 'guides/building-teams' },
            {
              label: 'LLM Team Generation',
              slug: 'guides/llm-team-generation',
            },
            {
              label: 'Understanding the Concurrent Driver',
              slug: 'guides/understanding-concurrent-driver',
            },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Text DSL Format', slug: 'reference/text-dsl' },
            { label: 'Actor API', slug: 'reference/actor-api' },
            { label: 'Selectors', slug: 'reference/selectors' },
            { label: 'CLI Reference', slug: 'reference/cli' },
            {
              label: 'Concurrent and Classic Mode',
              slug: 'reference/concurrent-and-classic',
            },
          ],
        },
        {
          label: 'FAQ',
          items: [
            {
              label: 'Concurrent vs Classic',
              slug: 'faq/concurrent-vs-classic',
            },
            { label: 'Is Scenetest Safe?', slug: 'faq/security' },
            { label: 'Swarm Mode', slug: 'faq/swarm-mode' },
            { label: 'VS Code Extension', slug: 'faq/vscode-extension' },
            { label: 'Compare to Playwright', slug: 'faq/vs-playwright' },
            { label: 'Compare to Vitest', slug: 'faq/vs-vitest' },
            { label: 'Compare to Cypress', slug: 'faq/vs-cypress' },
          ],
        },
      ],
    }),
  ],
});
