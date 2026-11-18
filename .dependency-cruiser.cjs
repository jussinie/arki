/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'only-api-and-shared-import-supabase',
      comment:
        'Only src/features/*/api/**, src/shared/supabase/**, and tools/import/** may import Supabase',
      severity: 'error',
      from: {
        pathNot:
          '^(src/features/[^/]+/api/|src/shared/supabase/|tools/import/)',
      },
      to: {
        path: '((node_modules/@supabase/supabase-js)|^@supabase/supabase-js|src/shared/supabase/)',
      },
    },
    {
      name: 'ui-never-imports-supabase-or-feature-internals',
      comment:
        'Shared UI components never import Supabase or feature internals',
      severity: 'error',
      from: {
        path: '^src/shared/ui/',
      },
      to: {
        path: '(src/features/|src/shared/supabase/|(node_modules/@supabase/supabase-js)|^@supabase/supabase-js)',
      },
    },
    {
      name: 'cross-feature-only-via-index',
      comment:
        'Features may only import from other features through their barrel index.ts',
      severity: 'error',
      from: {
        path: '^src/features/([^/]+)/',
      },
      to: {
        path: '^src/features/([^/]+)/',
        pathNot: ['^src/features/$1/', '^src/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'app-to-feature-only-via-index',
      comment:
        'App root may only import from features through their barrel index.ts',
      severity: 'error',
      from: {
        path: '^src/app/',
      },
      to: {
        path: '^src/features/[^/]+/',
        pathNot: '^src/features/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'pure-nutrition-contract',
      comment:
        'src/nutrition/** is pure TS and cannot import React, Supabase, features, or app',
      severity: 'error',
      from: {
        path: '^src/nutrition/',
      },
      to: {
        path: '((node_modules/(react|react-dom|@supabase/supabase-js))|^(react|react-dom|@supabase/supabase-js)|src/features/|src/app/|src/shared/supabase/)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
