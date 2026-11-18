import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Use the local stack's public credentials unless explicitly configured.
const localSupabase: { API_URL?: string; ANON_KEY?: string } =
  process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
    ? {}
    : (JSON.parse(
        execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
          encoding: 'utf8',
        })
      ) as { API_URL: string; ANON_KEY: string });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL:
        process.env.VITE_SUPABASE_URL ??
        localSupabase.API_URL ??
        'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY:
        process.env.VITE_SUPABASE_ANON_KEY ??
        localSupabase.ANON_KEY ??
        'placeholder-anon-key',
    },
  },
});
