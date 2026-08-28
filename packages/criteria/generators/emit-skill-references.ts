/**
 * Generates the criteria reference files for the authoring skill.
 *
 * The skill and the auditor must describe the same criteria in the same words —
 * if they drift, an agent authors against one standard and gets audited against
 * another. So the references are generated from `criteria.json` (which is itself
 * generated from the official check sheet) rather than written by hand.
 *
 *   node --experimental-strip-types packages/criteria/src/emit-skill-references.ts <skill-references-dir>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalogue, CheckItem } from '../src/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const outDir = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(HERE, '../../../skills/authoring/references');
  const catalogue = JSON.parse(await readFile(resolve(HERE, '../data/criteria.json'), 'utf8')) as Catalogue;

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'criteria-part1-web.md'), renderPart1(catalogue), 'utf8');
  await writeFile(resolve(outDir, 'criteria-part2-documents.md'), renderPart2(catalogue), 'utf8');

  const p1 = catalogue.items.filter((i) => i.engine.part === 1).length;
  const p2 = catalogue.items.filter((i) => i.engine.part === 2).length;
  const il = catalogue.items.filter((i) => i.engine.part === 'IL').length;
  console.log(`Wrote criteria references to ${outDir} (part 1: ${p1}, part 2: ${p2}, Israeli additions: ${il}).`);
}

function renderPart1(catalogue: Catalogue): string {
  const items = catalogue.items.filter((i) => i.engine.part === 1);
  const israeli = catalogue.items.filter((i) => i.engine.part === 'IL');
  const lines: string[] = [];

  lines.push('# IS 5568 part 1 — the web criteria');
  lines.push('');
  lines.push('> **Generated file — do not edit by hand.**');
  lines.push('> Produced from the official check sheet by `emit-skill-references.ts`.');
  lines.push(`> Source: ${catalogue.source.file} → sheet "${catalogue.source.sheet}".`);
  lines.push('');
  lines.push(
    `${items.length} check rows. The Hebrew wording, numbering and required level are copied from the sheet verbatim — ` +
      'including where its level differs from WCAG\'s own (it marks 1.2.1 as AA and 2.4.10 as AA).',
  );
  lines.push('');
  lines.push('**Level AA is the requirement.** Level A applies only under a granted Regulation 35(b)(2) exemption.');
  lines.push('');
  lines.push('## Index');
  lines.push('');
  lines.push('| # | מס\' קריטריון | קריטריון | רמה | תמצית |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [i, item] of items.entries()) {
    lines.push(
      `| ${i + 1} | [${item.form.criterionNo}](#${anchor(item)}) | ${item.form.criterionNameHe} | ${item.form.level} | ${firstSentence(item.engine.summaryHe)} |`,
    );
  }
  lines.push('');

  let guideline = '';
  for (const item of items) {
    if (item.form.guidelineHe !== guideline) {
      guideline = item.form.guidelineHe;
      lines.push(`## ${guideline}`);
      if (item.form.guidelineFullHe && item.form.guidelineFullHe !== guideline) {
        lines.push('');
        lines.push(`> ${collapse(item.form.guidelineFullHe)}`);
      }
      lines.push('');
    }
    lines.push(...renderItem(item));
  }

  lines.push('---');
  lines.push('');
  lines.push('# תוספות ישראליות — duties beyond WCAG');
  lines.push('');
  lines.push(
    'These are not on the check sheet and are not WCAG criteria. They come from the Equal Rights Regulations and ' +
      'apply to the service as a whole rather than to any single page.',
  );
  lines.push('');
  for (const item of israeli) lines.push(...renderItem(item));

  return lines.join('\n');
}

function renderPart2(catalogue: Catalogue): string {
  const items = catalogue.items.filter((i) => i.engine.part === 2);
  const lines: string[] = [];

  lines.push('# IS 5568 part 2 — downloadable digital documents');
  lines.push('');
  lines.push('> **Generated file — do not edit by hand.**');
  lines.push('> Produced by `emit-skill-references.ts` from SI 5568 part 2 (May 2020).');
  lines.push('');
  lines.push(
    'Part 2 applies to digital documents downloadable over the internet that are **not** interactive forms — ' +
      'PDF, Word, Excel, PowerPoint and plain text. Interactive or fillable documents fall under part 1 instead.',
  );
  lines.push('');
  lines.push('## Why this list is shorter than part 1');
  lines.push('');
  lines.push(
    'Part 2 names a specific subset of the WCAG 2.0 AA criteria as applicable to documents. Do not apply the full ' +
      'web list to a PDF by analogy — and note two places where part 2 deliberately differs:',
  );
  lines.push('');
  lines.push('- **Link purpose (2.4.4) is relaxed.** Part 2 states that "לחץ כאן" inside an explanatory sentence satisfies the criterion.');
  lines.push('- **Text as image (1.4.5) is tightened.** Part 2 prohibits scanned files outright.');
  lines.push('');
  lines.push('## Large text thresholds (§3.6) — different from the web');
  lines.push('');
  lines.push('| גודל הגופן | מסמכי עיבוד תמלילים (נק\') | דפי אינטרנט (פיקסלים) | ניגודיות מינימלית |');
  lines.push('| --- | --- | --- | --- |');
  lines.push('| רגיל | פחות מ-14 | פחות מ-18.5 | 4.5 |');
  lines.push('| לודג (מודגש) | 14 ומעלה | 18.5 ומעלה | 3 |');
  lines.push('| גדול (לא מודגש) | 14 ומעלה | 18.5 ומעלה | 4.5 |');
  lines.push('| גדול מאוד | 18 ומעלה | 24 ומעלה | 3 |');
  lines.push('');
  lines.push('> Using the web thresholds when authoring a Word document is a common and silent error: 14pt bold text ' +
    'is "large" in a document (3:1) but would not be on the web.');
  lines.push('');
  lines.push('## Criteria');
  lines.push('');

  let guideline = '';
  for (const item of items) {
    if (item.form.guidelineHe !== guideline) {
      guideline = item.form.guidelineHe;
      lines.push(`### ${guideline}`);
      lines.push('');
    }
    lines.push(...renderItem(item, 4));
  }

  return lines.join('\n');
}

function renderItem(item: CheckItem, headingLevel = 3): string[] {
  const h = '#'.repeat(headingLevel);
  const lines: string[] = [];
  lines.push(`${h} ${item.form.criterionNo} — ${item.form.criterionNameHe} · רמה ${item.form.level}`);
  lines.push('');
  lines.push(`**נוסח הקריטריון (מטופס הבדיקה):**`);
  lines.push('');
  for (const line of item.form.descriptionHe.split('\n')) lines.push(`> ${line}`);
  lines.push('');
  lines.push(`**מה זה אומר בפועל:** ${item.engine.summaryHe}`);
  lines.push('');
  lines.push(`**מה נחשב כשל:** ${item.engine.rubricHe}`);
  lines.push('');
  lines.push(`**כשאתם יוצרים תוכן:** ${item.engine.remediation.goalHe}`);
  lines.push('');
  lines.push(item.engine.remediation.instruction);
  lines.push('');

  if (item.engine.remediation.hebrewStrings && Object.keys(item.engine.remediation.hebrewStrings).length) {
    lines.push('**מחרוזות בעברית לשימוש:**');
    lines.push('');
    lines.push('| מפתח | טקסט |');
    lines.push('| --- | --- |');
    for (const [k, v] of Object.entries(item.engine.remediation.hebrewStrings)) {
      lines.push(`| \`${k}\` | ${v === '' ? '*(ריק)*' : v} |`);
    }
    lines.push('');
  }

  const links = [
    item.form.techniquesUrl ? `[טכניקות W3C](${item.form.techniquesUrl})` : '',
    item.form.understandingUrl ? `[Understanding](${item.form.understandingUrl})` : '',
  ].filter(Boolean);
  if (links.length) {
    lines.push(`מקורות: ${links.join(' · ')}`);
    lines.push('');
  }

  return lines;
}

function anchor(item: CheckItem): string {
  return `${item.form.criterionNo}-${item.form.criterionNameHe}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function firstSentence(s: string): string {
  const idx = s.indexOf('.');
  return (idx > 0 ? s.slice(0, idx + 1) : s).replace(/\|/g, '\\|');
}

function collapse(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
