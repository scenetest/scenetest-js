export interface SectionItem {
  slug: string
  title: string
  description: string
}

export const guides: SectionItem[] = [
  {
    slug: 'writing-scene-specs',
    title: 'Scene Specs',
    description:
      'Learn how to write scene specs that describe user journeys and orchestrate browser interactions.',
  },
  {
    slug: 'writing-inline-assertions',
    title: 'Inline Assertions',
    description:
      'Use assert(), should() and failed() in application code to check state across the server-client boundary.',
  },

  {
    slug: 'building-teams',
    title: 'Teams of Actors',
    description:
      'Design teams that mirror your seed data, scale concurrency, and keep scenes reliable without shared-state bugs.',
  },
]

export const reference: SectionItem[] = [
  {
    slug: 'cli',
    title: 'CLI Reference',
    description:
      'Command-line options, configuration file format, team discovery, device rotation, swarm mode, and report output.',
  },
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
    slug: 'concurrent-and-classic',
    title: 'Concurrent and Classic Mode',
    description:
      'Side-by-side comparison of scene() (concurrent) and test() (classic driver): syntax, multi-actor concurrency, coordination, and conditional monitors.',
  },
]

export const faqs: SectionItem[] = [

  {
    slug: 'concurrent-vs-classic',
    title: "What's the difference between Concurrent and Classic?",
    description:
      'How the concurrent drain model is built on the classic async driver, and why support both (for now).',
  },
  {
	  slug: 'security',
	  title: 'Is it safe?',
	  description:
	  `Yes, we make very sure that none of your tests or server fns ever make it into your production bundle! Read up.`,
	},
	{
		slug: 'swarm-mode',
		title: 'What is "swarm mode"?',
		description:
      'A diagnostic escalation that runs all teams against failing scenes to classify failures as broken, flaky, or seed-data edge cases.',
	},
	{
		slug: 'vscode-extension',
		title: 'Syntax Highlighting?',
		description:
		 "Yes, we made a VSCode extension to make the markdown DSL feel more like writing Javascript.",
	},
	{
	  slug: 'vs-playwright',
	  title: "Compare to page.evaluate()",
	  description:
		 "Playwright lets you run code inside the browser from your test file. Scenetest flips this around — assertions live in your app code and fire automatically.",
	},
	{
	  slug: 'vs-vitest',
	  title: "Compare to Vitest's in-source",
	  description:
		 'Vitest in-source tests run in Node with mocked dependencies. Scenetest assertions run inside a real browser with real state, real hooks, and real network calls.',
	},
	{
	  slug: 'vs-cypress',
	  title: 'Compare to Cypress component testing',
	  description:
		 'Cypress mounts components in isolation. Scenetest runs assertions inside your full application, testing components in context with real data and routing.',
	},
]
