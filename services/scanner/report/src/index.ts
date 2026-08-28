/** Report emitters. One scan result in, every output format out. */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalogue } from '@ai5568/criteria';
import type { ScanReport } from '../../src/types.ts';
import { renderHtmlReport } from './html.ts';
import { renderRemediation } from '@ai5568/remediation';
import { writeXlsxReport } from './xlsx.ts';
import { writeTaggedPdf } from './pdf.ts';

export type ReportFormat = 'html' | 'xlsx' | 'json' | 'md' | 'pdf';

export const ALL_FORMATS: ReportFormat[] = ['html', 'xlsx', 'json', 'md', 'pdf'];

export interface EmitResult {
  written: { format: ReportFormat; path: string }[];
  /** Formats that could not be produced, with the reason. Never silent. */
  failed: { format: ReportFormat; reason: string }[];
}

export async function emitReports(
  report: ScanReport,
  catalogue: Catalogue,
  outDir: string,
  formats: ReportFormat[],
): Promise<EmitResult> {
  await mkdir(outDir, { recursive: true });
  const written: EmitResult['written'] = [];
  const failed: EmitResult['failed'] = [];

  const htmlPath = join(outDir, 'report.html');
  // The PDF is rendered from the HTML, so it is produced even when only `pdf`
  // was asked for — but then cleaned up so the caller gets what they requested.
  const needsHtml = formats.includes('html') || formats.includes('pdf');

  if (needsHtml) {
    try {
      await writeFile(htmlPath, renderHtmlReport(report, catalogue), 'utf8');
      if (formats.includes('html')) written.push({ format: 'html', path: htmlPath });
    } catch (err) {
      failed.push({ format: 'html', reason: message(err) });
    }
  }

  if (formats.includes('xlsx')) {
    const path = join(outDir, 'report.xlsx');
    try {
      await writeXlsxReport(report, catalogue, path);
      written.push({ format: 'xlsx', path });
    } catch (err) {
      failed.push({ format: 'xlsx', reason: message(err) });
    }
  }

  if (formats.includes('json')) {
    const path = join(outDir, 'report.json');
    try {
      await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
      written.push({ format: 'json', path });
    } catch (err) {
      failed.push({ format: 'json', reason: message(err) });
    }
  }

  if (formats.includes('md')) {
    const dir = join(outDir, 'remediation');
    try {
      const files = renderRemediation(report, catalogue);
      if (files.length === 0) {
        // Nothing to remediate is a real outcome worth stating, not an empty dir.
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'README.md'), '# אין תיקונים נדרשים\n\nלא נמצאו כשלים בסריקה זו.\n', 'utf8');
        written.push({ format: 'md', path: dir });
      } else {
        await mkdir(dir, { recursive: true });
        for (const file of files) await writeFile(join(dir, file.name), file.content, 'utf8');
        written.push({ format: 'md', path: dir });
      }
    } catch (err) {
      failed.push({ format: 'md', reason: message(err) });
    }
  }

  if (formats.includes('pdf')) {
    const path = join(outDir, 'report.pdf');
    try {
      await writeTaggedPdf(htmlPath, path);
      written.push({ format: 'pdf', path });
    } catch (err) {
      failed.push({ format: 'pdf', reason: message(err) });
    }
    if (!formats.includes('html')) await rm(htmlPath, { force: true }).catch(() => undefined);
  }

  return { written, failed };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { renderHtmlReport, renderRemediation, writeXlsxReport };
