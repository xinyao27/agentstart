import { resolve } from 'node:path'

import { defineConfig } from 'vite-plus'

const lintProfile = process.env.YIRU_LINT_PROFILE
// Why: SwiftPM checkouts and generated protobuf bindings are external/generated inputs; linting
// them creates non-actionable violations and makes regeneration non-deterministic.
const lintIgnorePatterns = [
  '**/node_modules',
  '**/.build',
  '**/build',
  '**/dist',
  '**/out',
  'packages/protocol/typescript/generated/**'
]

const yiruRootToolingConfig = defineConfig({
  staged: {
    '*.{ts,tsx,js,jsx,mjs,mts,cts}': ['vp lint', 'vp fmt --write'],
    '*.{json,css}': ['vp fmt --write']
  },
  fmt: {
    // Why: Markdown includes generated skill guides whose formatting is part of
    // their authored content; toolchain migration must not rewrite that prose.
    // worker-configuration.d.ts must stay byte-identical to `wrangler types`
    // output because the APNs gateway CI gate diffs the regenerated file.
    // SwiftPM's .build contains read-only dependency checkouts, not project source. Protobuf's
    // TypeScript filenames and formatting are generator-owned and must stay reproducible.
    ignorePatterns: [
      '**/*.md',
      '**/.build',
      '**/build',
      '**/worker-configuration.d.ts',
      'packages/protocol/typescript/generated/**'
    ],
    singleQuote: true,
    semi: false,
    printWidth: 100,
    trailingComma: 'none',
    sortImports: {},
    sortPackageJson: true,
    sortTailwindcss: {}
  },
  lint:
    lintProfile === 'switch-exhaustiveness'
      ? {
          plugins: ['typescript'],
          categories: {
            correctness: 'off',
            suspicious: 'off',
            pedantic: 'off',
            perf: 'off',
            style: 'off',
            restriction: 'off',
            nursery: 'off'
          },
          rules: {
            'typescript/switch-exhaustiveness-check': [
              'error',
              { allowDefaultCaseForExhaustiveSwitch: false }
            ]
          },
          ignorePatterns: lintIgnorePatterns,
          options: { typeAware: true, typeCheck: false }
        }
      : lintProfile === 'react-doctor'
        ? {
            plugins: [],
            categories: {
              correctness: 'off',
              suspicious: 'off',
              pedantic: 'off',
              perf: 'off',
              style: 'off',
              restriction: 'off',
              nursery: 'off'
            },
            rules: {
              'react-doctor/no-adjust-state-on-prop-change': 'error',
              'react-doctor/no-derived-state-effect': 'error',
              'react-doctor/no-initialize-state': 'error'
            },
            ignorePatterns: lintIgnorePatterns,
            options: { typeAware: false, typeCheck: false },
            jsPlugins: [{ name: 'react-doctor', specifier: 'oxlint-plugin-react-doctor' }]
          }
        : {
            plugins: ['typescript', 'react', 'react-perf', 'unicorn'],
            categories: {
              correctness: 'error'
            },
            rules: {
              'react/jsx-no-duplicate-props': 'error',
              'react/jsx-no-undef': 'error',
              'react/no-children-prop': 'error',
              'react/no-danger-with-children': 'error',
              'react/no-direct-mutation-state': 'error',
              'react/no-find-dom-node': 'error',
              'react/no-render-return-value': 'error',
              'react/no-string-refs': 'error',
              'react/no-unescaped-entities': 'error',
              'react/require-render-return': 'error',
              'react/rules-of-hooks': 'error',
              'react/exhaustive-deps': 'error',
              'react/jsx-curly-brace-presence': [
                'error',
                {
                  props: 'never',
                  children: 'never',
                  propElementValues: 'always'
                }
              ],
              'react/jsx-filename-extension': [
                'error',
                {
                  extensions: ['.tsx', '.jsx']
                }
              ],
              'react/jsx-fragments': 'error',
              'react/jsx-key': 'error',
              'react/jsx-no-constructed-context-values': 'error',
              'react/jsx-no-target-blank': 'error',
              'react/jsx-no-useless-fragment': [
                'error',
                {
                  allowExpressions: true
                }
              ],
              'react/jsx-pascal-case': 'error',
              'react/no-object-type-as-default-prop': 'error',
              'react/self-closing-comp': 'error',
              'react-doctor/no-adjust-state-on-prop-change': 'error',
              'react-doctor/no-derived-state-effect': 'error',
              'react-doctor/no-initialize-state': 'error',
              'typescript/array-type': 'error',
              'typescript/consistent-indexed-object-style': 'error',
              'typescript/consistent-type-assertions': 'error',
              'typescript/consistent-type-definitions': ['error', 'type'],
              'typescript/consistent-type-imports': 'error',
              'typescript/no-explicit-any': [
                'error',
                {
                  ignoreRestArgs: true
                }
              ],
              'typescript/no-import-type-side-effects': 'error',
              'typescript/no-unnecessary-boolean-literal-compare': 'error',
              'typescript/no-unnecessary-template-expression': 'error',
              'typescript/no-unsafe-function-type': 'warn',
              'typescript/prefer-function-type': 'error',
              'typescript/prefer-includes': 'error',
              'typescript/prefer-optional-chain': 'error',
              'typescript/switch-exhaustiveness-check': [
                'error',
                {
                  allowDefaultCaseForExhaustiveSwitch: false
                }
              ],
              curly: 'error',
              'no-unneeded-ternary': 'error',
              'no-useless-return': 'error',
              'prefer-template': 'error',
              'unicorn/consistent-empty-array-spread': 'error',
              'unicorn/error-message': 'error',
              'unicorn/filename-case': 'error',
              'unicorn/no-array-fill-with-reference-type': 'warn',
              'unicorn/no-array-reverse': 'error',
              'unicorn/no-instanceof-builtins': 'error',
              'unicorn/no-useless-promise-resolve-reject': 'error',
              'unicorn/prefer-array-find': 'error',
              'unicorn/prefer-array-flat-map': 'warn',
              'unicorn/prefer-array-index-of': 'error',
              'unicorn/prefer-at': 'error',
              'unicorn/prefer-date-now': 'error',
              'unicorn/prefer-includes': 'error',
              'unicorn/prefer-import-meta-properties': 'error',
              'unicorn/prefer-math-min-max': 'error',
              'unicorn/prefer-negative-index': 'error',
              'unicorn/prefer-node-protocol': 'error',
              'unicorn/prefer-number-properties': 'error',
              'unicorn/prefer-object-from-entries': 'error',
              'unicorn/prefer-regexp-test': 'warn',
              'unicorn/prefer-ternary': 'error',
              'unicorn/throw-new-error': 'error',
              'vite-plus/prefer-vite-plus-imports': 'error'
            },
            overrides: [
              {
                files: ['**/*.ts'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 300,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              },
              {
                files: ['**/*.tsx'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 400,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              },
              {
                files: ['**/*.mjs'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 600,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              }
            ],
            ignorePatterns: lintIgnorePatterns,
            options: {
              // Why: Yiru type-checks three explicit tsc projects and enables only the
              // switch exhaustiveness type-aware rule in a separate narrow lint pass.
              typeAware: false,
              typeCheck: false
            },
            jsPlugins: [
              {
                name: 'vite-plus',
                specifier: 'vite-plus/oxlint-plugin'
              },
              {
                name: 'react-doctor',
                specifier: 'oxlint-plugin-react-doctor'
              }
            ]
          },
  resolve: {
    alias: {
      '~renderer': resolve(import.meta.dirname, 'packages/client/src')
    }
  }
})

export default yiruRootToolingConfig
