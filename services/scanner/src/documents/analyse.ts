/**
 * Downloads linked documents and runs the IS 5568 Part 2 checks on them.
 *
 * Downloadable PDFs and Office files are the part of an Israeli audit most
 * often skipped, and the part where failures are most likely — a scanned PDF
 * price list fails Part 2 outright no matter how good the surrounding HTML is.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalogue, CheckResult, Finding } from '@ai5568/criteria';
import { levelApplies } from '@ai5568/criteria';
import { checkDocumentApplicability } from '../checks/applicability.ts';
import type { DiscoveredDocument } from '../crawl/crawler.ts';
import type { ScanOptions, TargetReport } from '../types.ts';
import { summarise } from '../verdict.ts';
import { runDocumentRule, type DocumentFacts } from './rules.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIDECAR = resolve(HERE, '../../sidecar/analyze_document.py');

interface DownloadedDoc {
  doc: DiscoveredDocument;
  path: string;
  bytes: number;
  error?: string;
}

export async function analyseDocuments(
  documents: DiscoveredDocument[],
  catalogue: Catalogue,
  options: ScanOptions,
  // Judgement for documents is wired the same way as for pages; passing null
  // resolves rows deterministically instead.
  judge: unknown | null,
): Promise<TargetReport[]> {
  const workDir = join(options.outDir, 'documents');
  await mkdir(workDir, { recursive: true });

  const downloaded = await downloadAll(documents, workDir, options);
  const jobs = downloaded
    .filter((d) => !d.error)
    .map((d) => ({ path: d.path, kind: d.doc.docType, url: d.doc.url }));

  const facts = jobs.length > 0 ? await runSidecar(jobs) : [];
  const factsByUrl = new Map(facts.map((f) => [f.url, f]));

  const order = new Map(catalogue.items.map((item, i) => [item.id, i]));
  const reports: TargetReport[] = [];

  for (const entry of downloaded) {
    const docFacts = factsByUrl.get(entry.doc.url);
    const results = evaluateDocument({
      catalogue,
      facts: docFacts,
      downloadError: entry.error,
      doc: entry.doc,
      level: options.level,
      useAi: !options.noAi && judge !== null,
    }).sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));

    reports.push({
      kind: 'document',
      url: entry.doc.url,
      name: docFacts?.title?.trim() || decodeURIComponent(entry.doc.url.split('/').pop() ?? entry.doc.url),
      siteName: new URL(options.url).hostname,
      results,
      summary: summarise(results),
      scannedAt: new Date().toISOString(),
      ...(entry.error ? { error: entry.error } : {}),
    });
  }

  // Downloaded copies are only needed during analysis.
  await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  return reports;
}

interface EvaluateDocumentOptions {
  catalogue: Catalogue;
  facts: DocumentFacts | undefined;
  downloadError?: string;
  doc: DiscoveredDocument;
  level: 'A' | 'AA';
  useAi: boolean;
}

function evaluateDocument(opts: EvaluateDocumentOptions): CheckResult[] {
  const { catalogue, facts, downloadError, doc, level } = opts;
  const results: CheckResult[] = [];

  const items = catalogue.items.filter(
    (item) => item.engine.appliesTo.includes(doc.docType) && levelApplies(item.form.level, level),
  );

  for (const item of items) {
    if (downloadError || !facts) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: [{ locator: doc.url, reasonHe: `לא ניתן היה להוריד או לנתח את המסמך: ${downloadError ?? 'ניתוח לא הושלם'}` }],
        noteHe: 'המסמך לא נותח',
      });
      continue;
    }
    if (facts.error) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: [{ locator: doc.url, reasonHe: facts.error }],
        noteHe: 'ניתוח המסמך נכשל',
      });
      continue;
    }

    const applicability = checkDocumentApplicability(item.engine.applicability, facts);
    if (!applicability.applicable) {
      results.push({
        itemId: item.id,
        verdict: 'NA',
        method: 'na-probe',
        confidence: 1,
        findings: [],
        noteHe: applicability.reasonHe,
      });
      continue;
    }

    const findings: Finding[] = [];
    let decided = false;
    for (const ruleId of item.engine.customRules) {
      const ruleFindings = runDocumentRule(ruleId, facts);
      if (ruleFindings === null) continue;
      decided = true;
      findings.push(...ruleFindings);
    }

    if (findings.length > 0) {
      results.push({ itemId: item.id, verdict: 'FAIL', method: 'auto', confidence: 1, findings: findings.slice(0, 20) });
      continue;
    }

    // Same precedence as pages: a judgement row cannot be passed by a
    // mechanical rule. "Every image has some alt text" does not establish that
    // the alt text describes the image.
    const needsJudgement = item.engine.method === 'llm' || item.engine.method === 'hybrid';
    if (!decided || (needsJudgement && !opts.useAi)) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: [],
        noteHe:
          'קריטריון זה דורש שיקול דעת על תוכן המסמך ולא הוכרע אוטומטית. נדרשת בדיקה ידנית — הקריטריון אינו מסומן כתקין כל עוד לא אומת.',
      });
      continue;
    }

    results.push({
      itemId: item.id,
      verdict: 'PASS',
      method: 'auto',
      confidence: 1,
      findings: [],
      noteHe: documentPassNote(item.engine.applicability, facts),
    });
  }

  // Notes the analyser raised that are not tied to one criterion, but that a
  // reader of the report needs (encoding problems, recovered heading text).
  if (facts?.notes.length) {
    const first = results[0];
    if (first) first.noteHe = [first.noteHe, ...facts.notes].filter(Boolean).join(' | ');
  }

  return results;
}

function documentPassNote(probe: string, facts: DocumentFacts): string {
  switch (probe) {
    case 'hasImages':
      return `נבדקו ${facts.counts.images} תמונות במסמך.`;
    case 'hasHeadingsOrLists':
      return `נבדקו ${facts.counts.headings} כותרות ו-${facts.counts.lists} רשימות.`;
    case 'hasTables':
      return `נבדקו ${facts.counts.tables} טבלאות.`;
    case 'hasLinks':
      return `נבדקו ${facts.counts.links} קישורים.`;
    default:
      return 'לא נמצאו ממצאים בבדיקה האוטומטית של המסמך.';
  }
}

async function downloadAll(
  documents: DiscoveredDocument[],
  workDir: string,
  options: ScanOptions,
): Promise<DownloadedDoc[]> {
  const out: DownloadedDoc[] = [];
  let index = 0;

  for (const doc of documents) {
    index++;
    const safeName = `doc-${String(index).padStart(4, '0')}.${doc.docType === 'txt' ? 'txt' : doc.docType}`;
    const path = join(workDir, safeName);
    try {
      const res = await fetch(doc.url, {
        headers: { 'user-agent': options.userAgent },
        signal: AbortSignal.timeout(options.timeoutMs),
        redirect: 'follow',
      });
      if (!res.ok) {
        out.push({ doc, path, bytes: 0, error: `HTTP ${res.status} בעת הורדת המסמך` });
        continue;
      }
      const length = Number(res.headers.get('content-length') ?? '0');
      if (length > options.maxDocumentBytes) {
        out.push({ doc, path, bytes: length, error: `המסמך גדול מהמותר לניתוח (${Math.round(length / 1048576)}MB)` });
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > options.maxDocumentBytes) {
        out.push({ doc, path, bytes: buffer.byteLength, error: `המסמך גדול מהמותר לניתוח (${Math.round(buffer.byteLength / 1048576)}MB)` });
        continue;
      }
      await writeFile(path, buffer);
      out.push({ doc, path, bytes: buffer.byteLength });
    } catch (err) {
      out.push({ doc, path, bytes: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/** One Python process for the whole batch — the PDF libraries are slow to import. */
async function runSidecar(jobs: { path: string; kind: string; url: string }[]): Promise<DocumentFacts[]> {
  return new Promise((resolvePromise) => {
    const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const child = spawn(python, [SIDECAR], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));

    child.on('error', (err) => {
      // Python missing is a configuration problem, not a document problem —
      // surface it on every document rather than silently reporting no findings.
      resolvePromise(
        jobs.map((j) => failedFacts(j, `לא ניתן להריץ את מנתח המסמכים (${python}): ${err.message}. התקינו Python והריצו: python -m pip install -r requirements.txt`)),
      );
    });

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout) as DocumentFacts[] | { error: string };
        if (Array.isArray(parsed)) {
          resolvePromise(parsed);
          return;
        }
        resolvePromise(jobs.map((j) => failedFacts(j, parsed.error)));
      } catch {
        resolvePromise(jobs.map((j) => failedFacts(j, `מנתח המסמכים החזיר פלט לא תקין. ${stderr.slice(0, 400)}`)));
      }
    });

    child.stdin.write(JSON.stringify(jobs));
    child.stdin.end();
  });
}

function failedFacts(job: { path: string; kind: string; url: string }, error: string): DocumentFacts {
  return {
    kind: job.kind as DocumentFacts['kind'],
    url: job.url,
    fileName: job.path.split(/[\\/]/).pop() ?? job.path,
    bytes: 0,
    title: null,
    language: null,
    tagged: null,
    displayDocTitle: null,
    pageCount: 0,
    images: [],
    headings: [],
    lists: [],
    tables: [],
    links: [],
    textRuns: [],
    contrastFailures: [],
    readingOrderIssues: [],
    sensoryPhrases: [],
    complexInfo: [],
    scannedPages: [],
    textImages: [],
    colouredRuns: [],
    textLength: 0,
    counts: {},
    notes: [],
    error,
  };
}

export type { DocumentFacts };
