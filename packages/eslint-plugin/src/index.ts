import preferAriaLabel from './rules/prefer-aria-label.js'
import inlineServerFn from './rules/inline-server-fn.js'

const plugin = {
  meta: {
    name: '@scenetest/eslint-plugin',
    version: '0.1.0',
  },
  rules: {
    'prefer-aria-label': preferAriaLabel,
    'inline-server-fn': inlineServerFn,
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
    'scenetest/inline-server-fn': 'error',
  },
}

export default plugin
