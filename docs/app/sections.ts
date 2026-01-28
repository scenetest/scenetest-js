export interface SectionItem {
  slug: string
  title: string
  description: string
}

export const guides: SectionItem[] = [
  {
    slug: 'writing-scene-specs',
    title: 'Writing Scene Specs',
    description:
      'Learn how to write scene specs that describe user journeys and orchestrate browser interactions.',
  },
  {
    slug: 'writing-inline-assertions',
    title: 'Writing Inline Assertions',
    description:
      'Use assert(), should() and failed() in application code to check state across the server-client boundary.',
  },

  {
    slug: 'building-teams',
    title: 'Building Good Teams of Actors',
    description:
      'Design teams that mirror your seed data, scale concurrency, and keep scenes reliable without shared-state bugs.',
  },
]

export const reference: SectionItem[] = [
  {
    slug: 'actor-api',
    title: 'Actor API',
    description:
      'Complete reference for actor methods: navigation, visibility, interaction, scope, conditionals, and coordination.',
  },
  {
    slug: 'selectors',
    title: 'Selectors',
    description:
      'How selectors resolve to DOM elements: attribute matching, nested selectors, key selectors, aliases, and sigil prefixes.',
  },
  {
    slug: 'text-dsl',
    title: 'Text DSL Format',
    description:
      'Grammar for the text DSL, .spec.md markdown scenes, the dsl() method, and macros.',
  },
  {
    slug: 'declarative-and-classic',
    title: 'Declarative and Classic Mode',
    description:
      'Side-by-side comparison of scene() (declarative) and test() (classic driver): syntax, multi-actor concurrency, coordination, and conditional monitors.',
  },
]

export const faqs: SectionItem[] = [
  {
    slug: 'vs-playwright',
    title: "vs Playwright's page.evaluate()",
    description:
      "Playwright lets you run code inside the browser from your test file. Scenetest flips this around — assertions live in your app code and fire automatically.",
  },
  {
    slug: 'vs-vitest',
    title: "vs Vitest's in-source testing",
    description:
      'Vitest in-source tests run in Node with mocked dependencies. Scenetest assertions run inside a real browser with real state, real hooks, and real network calls.',
  },
  {
    slug: 'vs-cypress',
    title: 'vs Cypress component testing',
    description:
      'Cypress mounts components in isolation. Scenetest runs assertions inside your full application, testing components in context with real data and routing.',
  },
  {
    slug: 'security',
    title: 'Is it safe in development?',
    description:
      'Yes. Server functions are declared at build time and stripped in production. No runtime code injection is possible.',
  },
]
