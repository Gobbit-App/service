import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { stack } from '../../lib/stack';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Runs the real probe CLI; resolves (never rejects) with its exit code and stdout. */
function probe(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      `${repoRoot}node_modules/.bin/tsx`,
      ['infra/post-deploy-check.ts', ...args],
      { cwd: repoRoot, timeout: 60_000 },
      (error, stdout) => {
        const code = (error as { code?: unknown } | null)?.code;
        resolve({ code: error ? (typeof code === 'number' ? code : -1) : 0, stdout });
      },
    );
  });
}

test('the post-deploy probe passes against the live stack @smoke', async () => {
  const { code, stdout } = await probe([stack.webUrl, '--sha', stack.commit]);

  expect(stdout.trim().split('\n')).toEqual([
    'ok api-commit',
    'ok web-commit',
    'ok landing',
    'ok anonymous-refused',
    'ok public-health',
  ]);
  expect(code).toBe(0);
});

test('the post-deploy probe exits 2 with a usage line without --sha @smoke', async () => {
  const { code, stdout } = await probe([stack.webUrl]);

  expect(code).toBe(2);
  expect(stdout).toContain('usage: post-deploy-check');
});
