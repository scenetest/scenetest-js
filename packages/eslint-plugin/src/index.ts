import preferAriaLabel from './rules/prefer-aria-label.js'

const plugin = {
  meta: {
    name: '@scenecheck/eslint-plugin',
    version: '0.0.3',
  },
  rules: {
    'prefer-aria-label': preferAriaLabel,
  },
  configs: {} as Record<string, unknown>,
}

// Flat config (ESLint 9+) - recommended preset
plugin.configs['recommended'] = {
  plugins: {
    scenecheck: plugin,
  },
  rules: {
    'scenecheck/prefer-aria-label': 'warn',
  },
}

export default plugin
