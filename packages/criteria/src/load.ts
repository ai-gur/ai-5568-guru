/**
 * Catalogue loading.
 *
 * The catalogue lives in this package, so this package reads it. A consumer
 * that had to know the file path would be a consumer that breaks when the
 * layout changes — and there are four of them.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalogue } from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_PATH = resolve(HERE, '../data/criteria.json');

export async function loadCatalogue(): Promise<Catalogue> {
  try {
    return JSON.parse(await readFile(CATALOGUE_PATH, 'utf8')) as Catalogue;
  } catch {
    throw new Error(
      `Criteria catalogue not found at ${CATALOGUE_PATH}.\n` +
        `Run: npm run import-criteria -- "<path to sitedocs_internet_accessibility_form.xlsx>"`,
    );
  }
}
