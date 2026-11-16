import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

type CruisedViolation = {
  rule: {
    name: string;
    severity: string;
  };
  from: string;
  to: string;
};

type DepcruiseOutput = {
  summary: {
    violations: CruisedViolation[];
    error: number;
    warn: number;
    info: number;
    totalCruised: number;
  };
};

function runDepcruiseJson(rootDir: string): DepcruiseOutput {
  const result = spawnSync(
    'npx',
    ['depcruise', 'src', 'tools', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
    {
      cwd: rootDir,
      encoding: 'utf-8',
    }
  );

  try {
    return JSON.parse(result.stdout) as DepcruiseOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse depcruise json output (exit code ${result.status}):\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nError: ${err}`
    );
  }
}

function runDepcruiseCli(rootDir: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    'npx',
    ['depcruise', 'src', 'tools', '--config', '.dependency-cruiser.cjs'],
    {
      cwd: rootDir,
      encoding: 'utf-8',
    }
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('Module Boundary Enforcement (ADRs & Working Agreements)', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const createdFiles: string[] = [];

  function writeTempViolationFile(relativePath: string, content: string): string {
    const fullPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    createdFiles.push(fullPath);
    return fullPath;
  }

  afterEach(() => {
    while (createdFiles.length > 0) {
      const file = createdFiles.pop();
      if (file && fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  it('passes on the clean repository tree with 0 violations and exit code 0', () => {
    const cliResult = runDepcruiseCli(rootDir);
    expect(cliResult.status).toBe(0);

    const jsonOutput = runDepcruiseJson(rootDir);
    expect(jsonOutput.summary.error).toBe(0);
    expect(jsonOutput.summary.violations).toHaveLength(0);
  });

  it('rejects Supabase imports outside features/*/api, shared/supabase, and tools/import (Rule 1: only-api-and-shared-import-supabase)', () => {
    writeTempViolationFile(
      'src/features/water/ui/__violation__.ts',
      "import { supabase } from '../../../shared/supabase';\nexport const x = supabase;\n"
    );

    const cliResult = runDepcruiseCli(rootDir);
    expect(cliResult.status).not.toBe(0);

    const jsonOutput = runDepcruiseJson(rootDir);
    expect(jsonOutput.summary.error).toBeGreaterThan(0);
    const violation = jsonOutput.summary.violations.find(
      (v) => v.rule.name === 'only-api-and-shared-import-supabase'
    );
    expect(violation).toBeDefined();
    expect(violation?.from).toContain('src/features/water/ui/__violation__.ts');
  });

  it('rejects shared UI importing feature internals or Supabase (Rule 2: ui-never-imports-supabase-or-feature-internals)', () => {
    writeTempViolationFile(
      'src/shared/ui/__violation__.ts',
      "import { WaterTracker } from '../../features/water';\nexport const x = WaterTracker;\n"
    );

    const cliResult = runDepcruiseCli(rootDir);
    expect(cliResult.status).not.toBe(0);

    const jsonOutput = runDepcruiseJson(rootDir);
    expect(jsonOutput.summary.error).toBeGreaterThan(0);
    const violation = jsonOutput.summary.violations.find(
      (v) => v.rule.name === 'ui-never-imports-supabase-or-feature-internals'
    );
    expect(violation).toBeDefined();
    expect(violation?.from).toContain('src/shared/ui/__violation__.ts');
  });

  it('rejects cross-feature imports bypassing index.ts (Rule 3: cross-feature-only-via-index)', () => {
    writeTempViolationFile(
      'src/features/food-log/ui/__violation__.ts',
      "import { fetchWaterEntries } from '../../water/api';\nexport const x = fetchWaterEntries;\n"
    );

    const cliResult = runDepcruiseCli(rootDir);
    expect(cliResult.status).not.toBe(0);

    const jsonOutput = runDepcruiseJson(rootDir);
    expect(jsonOutput.summary.error).toBeGreaterThan(0);
    const violation = jsonOutput.summary.violations.find(
      (v) => v.rule.name === 'cross-feature-only-via-index'
    );
    expect(violation).toBeDefined();
    expect(violation?.from).toContain('src/features/food-log/ui/__violation__.ts');
  });

  it('rejects nutrition contract importing React or outside dependencies (Rule 4: pure-nutrition-contract)', () => {
    writeTempViolationFile(
      'src/nutrition/__violation__.ts',
      "import React from 'react';\nexport const x = React;\n"
    );

    const cliResult = runDepcruiseCli(rootDir);
    expect(cliResult.status).not.toBe(0);

    const jsonOutput = runDepcruiseJson(rootDir);
    expect(jsonOutput.summary.error).toBeGreaterThan(0);
    const violation = jsonOutput.summary.violations.find(
      (v) => v.rule.name === 'pure-nutrition-contract'
    );
    expect(violation).toBeDefined();
    expect(violation?.from).toContain('src/nutrition/__violation__.ts');
  });
});
