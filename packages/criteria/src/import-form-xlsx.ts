/**
 * Imports the official Israeli accessibility check sheet into the catalogue.
 *
 *   node --experimental-strip-types packages/criteria/src/import-form-xlsx.ts \
 *        "../sitedocs_internet_accessibility_form.xlsx"
 *
 * The sheet is the legally operative artifact: Regulation 93(a) requires the
 * duty-bearer to fill in the check sheet published by the Commissioner. So its
 * text, numbering and Israeli level are copied verbatim and never paraphrased —
 * including the places where its level departs from WCAG's own (it marks 1.2.1
 * and 2.4.10 as AA, where WCAG has them as A and AAA respectively).
 *
 * The importer is deliberately strict: if a row it does not recognise appears,
 * or a row it expects disappears, it says so and exits non-zero rather than
 * quietly producing a catalogue that no longer matches the form.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from './lib/unzip.ts';
import { ENGINE_OVERRIDES } from './overrides.ts';
import { NON_FORM_ITEMS } from './part2-and-israeli.ts';
import type { Catalogue, CheckItem, FormText } from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET_NAME = 'בדיקת נגישות לאינטרנט';
const OUT_PATH = resolve(HERE, '../data/criteria.json');

/** Columns as laid out in the sheet. Header row is row 3, data starts at row 4. */
const COL = { guideline: 'A', criterionNo: 'B', name: 'C', description: 'D', level: 'E', techniques: 'G', understanding: 'H' } as const;
const HEADER_ROW = 3;

// ── minimal xlsx reading ────────────────────────────────────────────────────
// exceljs would do this, but the importer runs before `npm install` in a fresh
// checkout and we only need shared strings + cell values + hyperlinks.

interface Sheet {
  cells: Map<string, string>;
  hyperlinks: Map<string, string>;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Concatenates every <t> inside a run-container, which is how Excel stores rich text. */
function textOf(xml: string): string {
  const out: string[] = [];
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out.push(decodeXmlEntities(m[1] ?? ''));
  return out.join('');
}

function parseSharedStrings(xml: string): string[] {
  const items: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) items.push(textOf(m[1] ?? ''));
  return items;
}

function parseSheet(xml: string, shared: string[], relsXml: string | undefined): Sheet {
  const cells = new Map<string, string>();
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
    let value: string;
    if (type === 's') {
      const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '-1');
      value = shared[idx] ?? '';
    } else if (type === 'inlineStr') {
      value = textOf(body);
    } else {
      value = decodeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
    }
    if (value !== '') cells.set(ref, value);
  }

  // Hyperlinks live in the sheet as r:id references resolved through the rels part.
  const relTargets = new Map<string, string>();
  if (relsXml) {
    for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
      const a = m[1] ?? '';
      const id = /\bId="([^"]+)"/.exec(a)?.[1];
      const target = /\bTarget="([^"]+)"/.exec(a)?.[1];
      if (id && target) relTargets.set(id, decodeXmlEntities(target));
    }
  }
  const hyperlinks = new Map<string, string>();
  for (const m of xml.matchAll(/<hyperlink\b([^>]*)\/?>/g)) {
    const a = m[1] ?? '';
    const ref = /\bref="([^"]+)"/.exec(a)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(a)?.[1];
    if (!ref || !rid) continue;
    const target = relTargets.get(rid);
    if (!target) continue;
    // A ref can be a range (A5:A7); expand only single-column vertical ranges.
    const range = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
    if (range && range[1] === range[3]) {
      for (let r = Number(range[2]); r <= Number(range[4]); r++) hyperlinks.set(`${range[1]}${r}`, target);
    } else {
      hyperlinks.set(ref, target);
    }
  }
  return { cells, hyperlinks };
}

async function readWorkbookSheet(path: string, sheetName: string): Promise<Sheet> {
  const buf = await readFile(path);
  const zip = unzipSync(new Uint8Array(buf));
  const get = (name: string): string | undefined => {
    const entry = zip[name];
    return entry ? strFromU8(entry) : undefined;
  };

  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error(`${path} is not a valid .xlsx (no xl/workbook.xml)`);

  const sheetTag = [...workbook.matchAll(/<sheet\b([^>]*)\/>/g)]
    .map((m) => m[1] ?? '')
    .find((a) => decodeXmlEntities(/\bname="([^"]*)"/.exec(a)?.[1] ?? '') === sheetName);
  if (!sheetTag) {
    const names = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodeXmlEntities(m[1] ?? ''));
    throw new Error(`Sheet "${sheetName}" not found. Sheets present: ${names.join(', ')}`);
  }
  const rid = /\br:id="([^"]+)"/.exec(sheetTag)?.[1];

  const wbRels = get('xl/_rels/workbook.xml.rels') ?? '';
  const target = [...wbRels.matchAll(/<Relationship\b([^>]*)\/>/g)]
    .map((m) => m[1] ?? '')
    .find((a) => /\bId="([^"]+)"/.exec(a)?.[1] === rid);
  const sheetPath = 'xl/' + (/\bTarget="([^"]+)"/.exec(target ?? '')?.[1] ?? 'worksheets/sheet1.xml').replace(/^\.?\//, '');

  const sheetXml = get(sheetPath);
  if (!sheetXml) throw new Error(`Sheet part ${sheetPath} missing from workbook`);
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  return parseSheet(sheetXml, parseSharedStrings(get('xl/sharedStrings.xml') ?? ''), get(relsPath));
}

// ── normalisation ───────────────────────────────────────────────────────────

/**
 * Cell text arrives with the sheet's own line breaks and stray spacing. We
 * collapse runs of whitespace but keep the newlines, because the lettered
 * sub-clauses (א. ב. ג.) are what makes column D readable.
 */
function tidy(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line, i, arr) => line !== '' || (i > 0 && i < arr.length - 1))
    .join('\n')
    .trim();
}

/** Column B occasionally arrives as " \n3.2.1" or "3.3.1 | 3.3.3". Keep every number. */
function normaliseCriterionNo(raw: string): string {
  const nums = [...raw.matchAll(/\d+(?:\.\d+)+/g)].map((m) => m[0]);
  if (nums.length === 0) return tidy(raw);
  return nums.join(' / ');
}

/** The guideline cell repeats a long definition on its first row and a short name after. */
function splitGuideline(raw: string): { short: string; full?: string } {
  const text = tidy(raw);
  const colon = text.indexOf(':');
  if (colon === -1) return { short: text };
  return { short: text.slice(0, colon).trim(), full: text };
}

function parseLevel(raw: string): 'A' | 'AA' {
  const v = tidy(raw).toUpperCase();
  if (v === 'A' || v === 'AA') return v;
  throw new Error(`Unexpected accessibility level "${raw}" — the sheet should only contain A or AA`);
}

// ── main ────────────────────────────────────────────────────────────────────

export async function importForm(xlsxPath: string): Promise<Catalogue> {
  const sheet = await readWorkbookSheet(xlsxPath, SHEET_NAME);

  const header = sheet.cells.get(`${COL.criterionNo}${HEADER_ROW}`);
  if (header !== 'מס קריטריון') {
    throw new Error(
      `Header check failed: expected "מס קריטריון" at ${COL.criterionNo}${HEADER_ROW}, found "${header ?? '(empty)'}". ` +
        `The sheet layout has changed — update COL/HEADER_ROW before re-importing.`,
    );
  }

  const items: CheckItem[] = [];
  const unknownRows: number[] = [];
  const seenRowIds = new Set<string>();
  let guidelineFullSoFar = new Map<string, string>();

  for (let row = HEADER_ROW + 1; ; row++) {
    const criterionRaw = sheet.cells.get(`${COL.criterionNo}${row}`);
    // Two consecutive empty rows means we reached the end of the table.
    if (!criterionRaw) {
      if (!sheet.cells.get(`${COL.criterionNo}${row + 1}`)) break;
      continue;
    }

    const id = `R${String(row).padStart(2, '0')}`;
    seenRowIds.add(id);

    const { short, full } = splitGuideline(sheet.cells.get(`${COL.guideline}${row}`) ?? '');
    if (full) guidelineFullSoFar.set(short, full);

    const form: FormText = {
      sourceRow: row,
      guidelineHe: short,
      guidelineFullHe: guidelineFullSoFar.get(short),
      criterionNo: normaliseCriterionNo(criterionRaw),
      criterionNameHe: tidy(sheet.cells.get(`${COL.name}${row}`)),
      descriptionHe: tidy(sheet.cells.get(`${COL.description}${row}`)),
      level: parseLevel(sheet.cells.get(`${COL.level}${row}`) ?? ''),
      techniquesUrl: sheet.hyperlinks.get(`${COL.techniques}${row}`),
      understandingUrl: sheet.hyperlinks.get(`${COL.understanding}${row}`),
    };

    const engine = ENGINE_OVERRIDES[id];
    if (!engine) {
      unknownRows.push(row);
      continue;
    }
    items.push({ id, form, engine });
  }

  const missing = Object.keys(ENGINE_OVERRIDES).filter((id) => !seenRowIds.has(id));
  const problems: string[] = [];
  if (unknownRows.length) {
    problems.push(
      `Sheet rows with no engine mapping: ${unknownRows.join(', ')}. ` +
        `Add entries to packages/criteria/src/overrides.ts keyed R<row>, or these checks will silently never run.`,
    );
  }
  if (missing.length) {
    problems.push(
      `Engine mappings with no matching sheet row: ${missing.join(', ')}. ` +
        `The sheet has changed shape — reconcile overrides.ts against it.`,
    );
  }
  if (problems.length) throw new Error(problems.join('\n'));

  return {
    source: {
      file: xlsxPath.replace(/\\/g, '/').split('/').pop() ?? xlsxPath,
      sheet: SHEET_NAME,
      importedAt: new Date().toISOString(),
      rowCount: items.length,
    },
    items: [...items, ...NON_FORM_ITEMS],
  };
}

async function main(): Promise<void> {
  const xlsxPath = process.argv[2] ?? resolve(HERE, '../../../../sitedocs_internet_accessibility_form.xlsx');
  const catalogue = await importForm(xlsxPath);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');

  const byPart = catalogue.items.reduce<Record<string, number>>((acc, i) => {
    const k = String(i.engine.part);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Imported ${catalogue.source.rowCount} rows from "${catalogue.source.sheet}".`);
  console.log(`Catalogue: ${catalogue.items.length} checks — part 1: ${byPart['1'] ?? 0}, part 2: ${byPart['2'] ?? 0}, Israeli additions: ${byPart['IL'] ?? 0}.`);
  console.log(`Written to ${OUT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('import-form-xlsx.ts')) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
