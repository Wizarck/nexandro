import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    // Exclude the lint-regression fixtures from the typed-parser block;
    // the dedicated block below handles them with a no-project parser
    // because they are intentionally absent from `tsconfig.json`.
    ignores: ['src/__test_fixtures__/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // m2-mcp-server / ADR-013: zero compile-time dependency from apps/api/
      // on agent vendor packages. The MCP layer lives in
      // packages/mcp-server-nexandro/ and proxies to apps/api/ via REST;
      // a direct import here would couple the API to an agent SDK and
      // violate the separability contract.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modelcontextprotocol/*', '@modelcontextprotocol/sdk'],
              message:
                'apps/api/ must not import agent vendor packages (ADR-013 / m2-mcp-server). Move the call to packages/mcp-server-nexandro/ and consume apps/api/ via REST.',
            },
          ],
        },
      ],
    },
  },
  {
    // Targeted block for the `src/__test_fixtures__/**` lint-regression
    // fixtures. The default block above uses the typed `@typescript-eslint`
    // parser with `parserOptions.project: tsconfig.json`; the fixtures are
    // NOT in tsconfig (so `nest build` ignores them) which would make that
    // parser emit "file not found in project" errors.  This block uses the
    // plain TS parser (no project) which still parses ESM `import` syntax
    // and lets the core `no-restricted-imports` rule fire.
    //
    // Default ignores below SKIP these files, so CI's
    // `npm run lint --workspace=apps/api` does not lint them; the
    // `agent-audit.middleware.spec.ts` test re-includes them via
    // `eslint --no-ignore <fixture>` and asserts the violation.
    files: ['src/__test_fixtures__/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modelcontextprotocol/*', '@modelcontextprotocol/sdk'],
              message:
                'apps/api/ must not import agent vendor packages (ADR-013 / m2-mcp-server). Move the call to packages/mcp-server-nexandro/ and consume apps/api/ via REST.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.config.mjs',
      'src/__test_fixtures__/**',
    ],
  },
];
