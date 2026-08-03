export interface SectionItem {
  slug: string
  title: string
  description: string
}

export const guides: SectionItem[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description:
      'Install Scenetest, write your first .spec.md scene, add inline checks, and start testing.',
  },
  {
    slug: 'writing-scene-specs',
    title: 'Scene Specs',
    description:
      'Write scene specs in Markdown: scope navigation, coordination, conditional handling, and the collaboration loop.',
  },
  {
    slug: 'writing-inline-assertions',
    title: 'Inline Assertions',
    description:
      'Use serverCheck(), should() and failed() in application code to check state across the server-client boundary.',
  },

  {
    slug: 'conditional-handling',
    title: 'Conditional Handling',
    description:
      'Use if() to dismiss optional UI like modals and banners, and warnIf() to flag unexpected paths without failing the test.',
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
	  slug: 'text-dsl',
	  title: 'Markdown Spec Reference',
	  description:
		 'Complete grammar for .spec.md scene files: actions, selectors, variable interpolation, macros, cleanup, and setup.',
	},
	// actor-api: consolidated into /reference/concurrent-and-classic (route redirect)
	{
	  slug: 'selectors',
	  title: 'Selectors',
	  description:
		 'How selectors resolve to DOM elements: attribute matching, nested selectors, key selectors, aliases, and sigil prefixes.',
	},
  {
    slug: 'cli',
    title: 'CLI Reference',
    description:
      'Command-line options, configuration file format, team discovery, device rotation, keyboard navigation, fuzzy-finger touch simulation, swarm mode, and report output.',
  },
  {
    slug: 'concurrent-and-classic',
    title: 'TypeScript Scenes & Playwright Specs',
    description:
      'Writing scenes in TypeScript with scene(), dropping to Playwright with test(), and when to use each.',
  },
  {
    slug: 'live-dashboard',
    title: 'Live Dashboard',
    description:
      'Real-time swim-lane timeline at /__scenetest showing actor actions, assertions, and timing as scenes run.',
  },
  {
    slug: 'observer-panel',
    title: 'Observer Panel',
    description:
      'The floating dev panel that shows every inline assertion as it fires: view modes, history, flaky detection, click-to-editor, and audio.',
  },
]

export const faqs: SectionItem[] = [

  // concurrent-vs-classic: consolidated into /reference/concurrent-and-classic (route redirect)
  {
    slug: 'scene-runtime',
    title: 'How the Scene Runtime Works',
    description:
      'What happens when a scene runs: declaration vs. drain, concurrent actor queues, scope management, conditional monitors, and the Playwright layer underneath.',
  },
  {
	  slug: 'security',
	  title: 'Is Scenetest Safe?',
	  description:
	  `Yes, the serverCheck bridge only runs in dev, and all your inline checks are stripped from your production bundle! Read up.`,
	},
	{
		slug: 'swarm-mode',
		title: 'What is "swarm mode"?',
		description:
      'A diagnostic escalation that runs all teams against failing scenes to classify failures as broken, flaky, or seed-data edge cases.',
	},
	{
		slug: 'vscode-extension',
		title: 'Did You Say "spec.md syntax highlighting"?',
		description:
		 "Yes, we made a VSCode extension to make markdown specs feel more like writing JavaScript.",
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
