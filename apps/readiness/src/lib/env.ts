import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Server-side configuration.
 *
 * The monorepo keeps one `.env.local` at the root so the app and the scanner
 * cannot drift apart on which Supabase project or which scanner they talk to.
 * Two env files is two truths, and the one you forget to update is always the
 * one that matters.
 *
 * Read here at runtime rather than in `next.config.ts`, because a bundler is
 * free to replace `process.env.X` at compile time with whatever it saw then —
 * which is how a value that is plainly present in the file still arrives
 * undefined. An explicit read cannot be inlined away.
 *
 * ⚠️ Server only. Nothing here may be imported from a client component; the
 * values include keys that bypass RLS.
 */

let cache: Record<string, string> | null = null;

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    out[match[1]] = (match[2] ?? '').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Walk up from the working directory looking for the file.
 *
 * A fixed `../../` looked obviously right and was not: the working directory
 * during `next start` is not reliably the app directory, so the relative path
 * resolved somewhere with no file and the value arrived undefined while sitting
 * in plain sight on disk. Searching upward is indifferent to where the process
 * happens to have been started from.
 */
function fileEnv(): Record<string, string> {
  if (cache) return cache;
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    try {
      cache = parse(readFileSync(resolve(dir, '.env.local'), 'utf8'));
      return cache;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break; // filesystem root
      dir = parent;
    }
  }
  // Absent in CI and in production, where the platform sets real environment
  // variables. Not an error.
  cache = {};
  return cache;
}

/**
 * A real environment variable always wins, so a deployment platform's own
 * configuration is never overridden by a file that happens to be checked out.
 */
export function serverEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  const value = fileEnv()[key];
  return value === '' ? undefined : value;
}

/** For values the app cannot run without. Fails loudly rather than silently. */
export function requireEnv(key: string): string {
  const value = serverEnv(key);
  if (!value) throw new Error(`Missing required configuration: ${key}`);
  return value;
}
