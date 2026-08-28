/**
 * Output #2 — per-page remediation instructions for an LLM coding agent.
 *
 * These files are written as *instructions to an agent*, not as prose for a
 * human reviewer. Each fix names the failing elements, states the end state,
 * gives a concrete patch, and ends with a command that re-checks just that
 * criterion — so the agent can close the loop itself.
 *
 * Two things are deliberate:
 *
 *   Unverified rows are separated from real findings. An agent handed "47
 *   failures" where 17 were never actually verified will invent fixes for
 *   things that were never broken, which is worse than leaving them alone.
 *
 *   Every file ends with a "do not" section. The most common way an agent
 *   "fixes" accessibility is by generating plausible alt text, bolting on an
 *   overlay widget, or deleting the offending element — all of which make the
 *   report look better and the site no better.
 */

import type { Catalogue, CheckItem, CheckResult } from '@ai5568/criteria';
import type { ScanReport, TargetReport } from '../../src/types.ts';

const EFFORT_ORDER = { low: 0, medium: 1, high: 2 } as const;

export interface RemediationFile {
  /** Filename, relative to the remediation directory. */
  name: string;
  content: string;
}

export function renderRemediation(report: ScanReport, catalogue: Catalogue): RemediationFile[] {
  const items = new Map(catalogue.items.map((i) => [i.id, i]));
  const files: RemediationFile[] = [];

  for (const target of [...report.pages, ...report.documents]) {
    const failures = target.results.filter((r) => r.verdict === 'FAIL');
    if (failures.length === 0) continue;
    files.push({
      name: `${slug(target.url)}.md`,
      content: renderTargetFile(target, failures, items, report),
    });
  }

  if (files.length > 1) files.unshift({ name: '00-index.md', content: renderIndex(report, files) });
  return files;
}

function renderTargetFile(
  target: TargetReport,
  failures: CheckResult[],
  items: Map<string, CheckItem>,
  report: ScanReport,
): string {
  const real = failures.filter((r) => r.confidence > 0);
  const unverified = failures.filter((r) => r.confidence === 0);

  // Fix cheap, high-certainty things first: an agent that runs out of budget
  // should have banked the wins, not half-finished the hardest item.
  const ordered = [...real].sort((a, b) => {
    const ea = EFFORT_ORDER[items.get(a.itemId)?.engine.remediation.effort ?? 'medium'];
    const eb = EFFORT_ORDER[items.get(b.itemId)?.engine.remediation.effort ?? 'medium'];
    if (ea !== eb) return ea - eb;
    return b.findings.length - a.findings.length;
  });

  const isDocument = target.kind === 'document';
  const lines: string[] = [];

  lines.push('---');
  lines.push(`url: ${target.url}`);
  lines.push(`title: ${quote(target.name)}`);
  lines.push(`site: ${quote(target.siteName)}`);
  lines.push(`kind: ${target.kind}`);
  lines.push(`standard: IS 5568 ${isDocument ? 'part 2' : 'part 1'}`);
  lines.push(`level: ${report.options.level}`);
  lines.push(`failures_with_findings: ${real.length}`);
  lines.push(`unverified_rows: ${unverified.length}`);
  lines.push(`scanned_at: ${target.scannedAt}`);
  lines.push('---');
  lines.push('');

  lines.push(`# תיקוני נגישות — ${target.name}`);
  lines.push('');
  lines.push('## Task');
  lines.push('');
  lines.push(
    isDocument
      ? `Make the document at \`${target.url}\` compliant with Israeli Standard 5568 part 2 (accessibility of digital documents), level ${report.options.level}. Apply every fix listed under "Fixes" below.`
      : `Make the page at \`${target.url}\` compliant with Israeli Standard 5568 part 1, level ${report.options.level}. Apply every fix listed under "Fixes" below.`,
  );
  lines.push('');
  lines.push(
    'Each fix names the exact elements that failed. Work from the selectors given — do not go looking for other things to change. ' +
      'Preserve the existing content, wording, and functionality: the goal is to make what is there accessible, not to rewrite it.',
  );
  lines.push('');

  if (real.length === 0) {
    lines.push('> No fixable findings were recorded for this target — every failing row is unverified (see below).');
    lines.push('');
  }

  lines.push('## Fixes');
  lines.push('');

  ordered.forEach((result, index) => {
    const item = items.get(result.itemId);
    if (!item) return;
    lines.push(...renderFix(index + 1, item, result, target));
  });

  if (unverified.length > 0) {
    lines.push('## Rows that could not be verified — check these manually, do not "fix" them blindly');
    lines.push('');
    lines.push(
      'The scan could not decide these criteria. They are recorded as "לא תקין" because the standard has no ' +
        '"unknown" state and an unverified criterion must never be reported as compliant — but **no defect was found**. ' +
        'Inspect each one; if it already complies, leave it alone.',
    );
    lines.push('');
    for (const r of unverified) {
      const item = items.get(r.itemId);
      if (!item) continue;
      lines.push(`- **${item.form.criterionNo} — ${item.form.criterionNameHe}** (רמה ${item.form.level})`);
      lines.push(`  - ${item.engine.summaryHe}`);
      if (r.noteHe) lines.push(`  - למה לא הוכרע: ${r.noteHe}`);
      lines.push(`  - איך לבדוק ידנית: ${item.engine.rubricHe}`);
    }
    lines.push('');
  }

  lines.push('## אל תעשה — do not do any of these');
  lines.push('');
  lines.push(
    '- **Do not invent alt text.** If you cannot tell what an image conveys, say so and leave it for a human. ' +
      'A confident but wrong description is worse than a missing one — a screen-reader user has no way to detect it.',
  );
  lines.push(
    '- **Do not install an accessibility overlay** (accessiBe, UserWay, EqualWeb, and similar). They do not make a site compliant; ' +
      'compliance is assessed against the rendered HTML. The FTC fined one such vendor $1M in April 2025 over exactly that claim.',
  );
  lines.push('- **Do not delete or hide content** to make a criterion pass. `aria-hidden` on a real control is a regression, not a fix.');
  lines.push('- **Do not add ARIA where a native element works.** `<button>` beats `role="button"` with a keydown handler in every case.');
  lines.push('- **Do not change visible wording, layout, or behaviour** beyond what a fix requires.');
  lines.push('- **Do not mark anything as done that you did not verify.** Re-run the check.');
  lines.push('');

  lines.push('## Verify');
  lines.push('');
  lines.push('After applying the fixes, re-run the scan against this target and confirm the rows now pass:');
  lines.push('');
  lines.push('```bash');
  lines.push(`is5568 scan ${target.url} --max-pages 1`);
  lines.push('```');
  lines.push('');
  lines.push(
    'Note that under the Equal Rights Regulations a deviation only becomes a violation if it is not corrected within ' +
      '60 days of a fix notice — so the re-verification, not the edit, is what closes the exposure.',
  );
  lines.push('');

  return lines.join('\n');
}

function renderFix(n: number, item: CheckItem, result: CheckResult, target: TargetReport): string[] {
  const lines: string[] = [];
  const rem = item.engine.remediation;

  lines.push(`### Fix ${n} — ${item.form.criterionNo} · ${item.form.criterionNameHe} · רמה ${item.form.level}`);
  lines.push('');
  lines.push(`**מה נדרש:** ${rem.goalHe}`);
  lines.push('');
  lines.push(`**Criterion (from the official check sheet):** ${collapse(item.form.descriptionHe)}`);
  lines.push('');

  if (result.findings.length > 0) {
    lines.push(`**Failing elements (${result.findings.length}):**`);
    lines.push('');
    for (const f of result.findings.slice(0, 20)) {
      lines.push(`- \`${f.locator}\``);
      if (f.snippet) {
        lines.push('');
        lines.push('  ```html');
        for (const line of clip(f.snippet, 500).split('\n')) lines.push(`  ${line}`);
        lines.push('  ```');
        lines.push('');
      }
      lines.push(`  ${f.reasonHe}`);
    }
    if (result.findings.length > 20) {
      lines.push(`- …ועוד ${result.findings.length - 20} ממצאים מאותו סוג. החל את אותו תיקון על כולם.`);
    }
    lines.push('');
  }

  if (result.noteHe) {
    lines.push(`**הערה:** ${result.noteHe}`);
    lines.push('');
  }

  lines.push('**How to fix**');
  lines.push('');
  lines.push(rem.instruction);
  lines.push('');

  if (rem.hebrewStrings && Object.keys(rem.hebrewStrings).length > 0) {
    lines.push('**Hebrew strings to use** — use these rather than translating your own, so wording stays consistent across the site:');
    lines.push('');
    lines.push('| מפתח | טקסט |');
    lines.push('| --- | --- |');
    for (const [key, value] of Object.entries(rem.hebrewStrings)) {
      lines.push(`| \`${key}\` | ${value === '' ? '*(מחרוזת ריקה)*' : value} |`);
    }
    lines.push('');
  }

  if (result.method === 'ai' || result.method === 'auto+ai') {
    lines.push(
      `> Confidence: ${result.confidence.toFixed(2)} — this row was assessed with AI judgement. ` +
        'Confirm the finding before making the change if the confidence is below 0.7.',
    );
    lines.push('');
  }

  lines.push(`**Verify:** \`is5568 verify --url ${target.url} --criterion ${item.form.criterionNo}\``);
  lines.push('');
  return lines;
}

function renderIndex(report: ScanReport, files: RemediationFile[]): string {
  const lines: string[] = [];
  lines.push(`# תיקוני נגישות — ${report.site.name}`);
  lines.push('');
  lines.push(
    `${files.length} targets need work. Each file below is self-contained: it names the failing elements on one page or document ` +
      'and the fix for each. They can be worked in any order, but the shared-component failures below will clear many files at once.',
  );
  lines.push('');

  if (report.siteWideFailures.length > 0) {
    lines.push('## Fix these first — they fail across most targets');
    lines.push('');
    lines.push('A criterion failing on nearly every page is almost always one shared template, header, or footer.');
    lines.push('');
    lines.push('| מס\' קריטריון | קריטריון | נכשל |');
    lines.push('| --- | --- | --- |');
    for (const f of report.siteWideFailures.slice(0, 10)) {
      lines.push(`| ${f.criterionNo} | ${f.criterionNameHe} | ${f.failCount} / ${f.total} |`);
    }
    lines.push('');
  }

  lines.push('## Files');
  lines.push('');
  for (const file of files) {
    if (file.name === '00-index.md') continue;
    lines.push(`- [${file.name}](./${file.name})`);
  }
  lines.push('');
  return lines.join('\n');
}

// ── helpers ─────────────────────────────────────────────────────────────────

function slug(url: string): string {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search)
      .replace(/[^\p{L}\p{N}\-_/.]+/gu, '-')
      .replace(/[/.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return (path || 'home').slice(0, 70);
  } catch {
    return 'target';
  }
}

function collapse(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}
