import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'reference/**', 'vendor/**', 'data/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // The original's core defect: LTV x4, walk x2, N x2, P x2, CUR x2.
      'no-redeclare': 'error',
      'no-shadow': 'error',
      'no-var': 'error',
      // The original swallows exceptions in 10 places, so a broken panel looks like an empty one.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The pure math layer may not touch the DOM or import UI/state. This is the module boundary,
    // enforced rather than documented.
    files: ['src/domain/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'alert'].map((name) => ({
          name,
          message: 'src/domain must be pure: no DOM, no browser globals, no I/O.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['**/ui/**', '**/state/**', '**/export/**', 'd3', 'xlsx'] },
      ],
    },
  },
  {
    // Harness scripts are mixed-environment: they run in node, but the functions they hand to
    // page.evaluate() execute inside the browser, so both global sets are legitimately in scope.
    files: ['scripts/**/*.mjs', 'tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-empty': 'off' },
  }
);
