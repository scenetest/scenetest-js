import preferAriaLabel from './rules/prefer-aria-label.js'

const plugin = {
  meta: {
    name: '@scenetest/eslint-plugin',
    version: '0.1.0',
  },
  rules: {
    'prefer-aria-label': preferAriaLabel,
  },
  configs: {} as Record<string, unknown>,
}

// Flat config (ESLint 9+) - recommended preset
plugin.configs['recommended'] = {
  plugins: {
    scenetest: plugin,
  },
  rules: {
    'scenetest/prefer-aria-label': 'warn',
  },
}

export default plugin
