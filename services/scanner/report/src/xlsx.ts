/**
 * Excel report — the official check sheet, filled in.
 *
 * The sheet's own instructions say: "הבדיקה תתבצע עבור כל תבנית עמוד או עמוד
 * ייחודי או מסמך (PDF, Word וכד') בנפרד. לצורך כך, יש לשכפל את הגיליון". So this
 * emitter does exactly that — one duplicated sheet per page and per document,
 * with the page name and URL in the header cells the form provides (A1 / C1),
 * and the same column order.
 *
 * That fidelity is the point: this workbook is the artifact Regulation 93(a)
 * requires a duty-bearer to produce, not a redesign of it. Our own additions
 * (verdict method, confidence, the Israeli rows) go in extra columns to the
 * side and in separate sheets, never by altering the form's own columns.
 */

import ExcelJS from 'exceljs';
import type { Catalogue, CheckItem, CheckResult } from '@ai5568/criteria';
import { VERDICT_HE, METHOD_HE } from '@ai5568/criteria';
import type { ScanReport, TargetReport } from '../../src/types.ts';

const FILL = {
  PASS: 'FFDCFCE7',
  FAIL: 'FFFEE2E2',
  NA: 'FFFEF3C7',
  UNVERIFIED: 'FFE0E7FF',
  HEADER: 'FFE8ECF1',
} as const;

const FONT_COLOR = {
  PASS: 'FF14532D',
  FAIL: 'FF7F1D1D',
  NA: 'FF713F12',
  UNVERIFIED: 'FF3730A3',
} as const;

export async function writeXlsxReport(report: ScanReport, catalogue: Catalogue, path: string): Promise<void> {
  const items = new Map(catalogue.items.map((i) => [i.id, i]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI 5568 Guru — readiness review';
  wb.created = new Date(report.startedAt);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  addIndexSheet(wb, report);
  addSummarySheet(wb, report, items);

  const used = new Set<string>();
  for (const target of [...report.pages, ...report.documents]) {
    addTargetSheet(wb, target, items, uniqueSheetName(target, used));
  }

  await wb.xlsx.writeFile(path);
}

function addIndexSheet(wb: ExcelJS.Workbook, report: ScanReport): void {
  const ws = wb.addWorksheet('אינדקס', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 6 }] });
  ws.columns = [{ width: 8 }, { width: 46 }, { width: 62 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }];

  title(ws, 'A1', `דוח בדיקת נגישות — ת"י 5568 — ${report.site.name}`);
  kv(ws, 2, 'כתובת האתר', report.site.startUrl);
  kv(ws, 3, 'מועד הסריקה', new Date(report.startedAt).toLocaleString('he-IL'));
  kv(ws, 4, 'רמת נגישות נבדקת', report.options.level);
  kv(ws, 5, 'גיליון הבדיקה', `${report.catalogueSource.sheet} (${report.catalogueSource.file})`);

  const header = ws.getRow(7);
  header.values = ['#', 'שם העמוד / מסמך', 'כתובת (URL)', 'תקין', 'לא תקין', 'מהם לא אומתו', 'לא רלוונטי'];
  styleHeaderRow(header);

  let r = 8;
  for (const [i, t] of [...report.pages, ...report.documents].entries()) {
    const row = ws.getRow(r++);
    row.values = [i + 1, t.name, t.url, t.summary.pass, t.summary.fail, t.summary.unverified, t.summary.na];
    row.getCell(3).alignment = { horizontal: 'left' };
    row.getCell(3).value = { text: t.url, hyperlink: t.url };
    row.commit();
  }
  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: r - 1, column: 7 } };
}

function addSummarySheet(wb: ExcelJS.Workbook, report: ScanReport, items: Map<string, CheckItem>): void {
  const ws = wb.addWorksheet('סיכום כשלים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] });
  ws.columns = [{ width: 14 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }];

  const header = ws.getRow(1);
  header.values = ['מס\' קריטריון', 'קריטריון בדיקה', 'רמה', 'נכשל ביעדים', 'סה"כ יעדים', 'שיעור כישלון'];
  styleHeaderRow(header);

  let r = 2;
  for (const f of report.siteWideFailures) {
    const item = items.get(f.itemId);
    const row = ws.getRow(r++);
    row.values = [f.criterionNo, f.criterionNameHe, item?.form.level ?? '', f.failCount, f.total, f.failCount / f.total];
    row.getCell(6).numFmt = '0%';
    row.commit();
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(r - 1, 1), column: 6 } };
}

/**
 * One sheet per page/document, laid out like the official form:
 * row 1 carries the name and URL, row 3 the column headers, data from row 4.
 */
function addTargetSheet(
  wb: ExcelJS.Workbook,
  target: TargetReport,
  items: Map<string, CheckItem>,
  sheetName: string,
): void {
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] });
  ws.columns = [
    { width: 34 }, // הנחיה
    { width: 13 }, // מס קריטריון
    { width: 30 }, // קריטריון בדיקה
    { width: 52 }, // תאור הקריטריון
    { width: 10 }, // רמה נדרשת בישראל
    { width: 14 }, // תוצאה
    { width: 62 }, // ממצאים
    { width: 20 }, // אופן הבדיקה  (our addition)
    { width: 10 }, // ביטחון       (our addition)
  ];

  // Header cells mirroring the form's own row 1.
  ws.getCell('A1').value = 'שם העמוד / מסמך:';
  ws.getCell('A1').font = { bold: true };
  ws.getCell('B1').value = target.name;
  ws.getCell('C1').value = 'כתובת העמוד / מסמך (URL):';
  ws.getCell('C1').font = { bold: true };
  ws.getCell('D1').value = { text: target.url, hyperlink: target.url };
  ws.getCell('D1').alignment = { horizontal: 'left' };

  const header = ws.getRow(3);
  header.values = [
    'הנחיה',
    'מס קריטריון',
    'קריטריון בדיקה',
    'תאור הקריטריון',
    'רמה נדרשת בישראל',
    'תוצאה\n(תקין / לא תקין / לא רלוונטי)',
    'ממצאים',
    'אופן הבדיקה',
    'ביטחון',
  ];
  styleHeaderRow(header);
  header.height = 32;

  let r = 4;
  for (const result of target.results) {
    const item = items.get(result.itemId);
    if (!item) continue;
    const row = ws.getRow(r++);
    const unverified = result.verdict === 'FAIL' && result.confidence === 0;

    row.values = [
      item.form.guidelineHe,
      item.form.criterionNo,
      item.form.criterionNameHe,
      // The form's own full wording, not our two-sentence summary — this
      // workbook is the official artifact and must carry the official text.
      item.form.descriptionHe,
      item.form.level,
      VERDICT_HE[result.verdict],
      findingsText(result),
      METHOD_HE[result.method],
      result.method === 'ai' || result.method === 'auto+ai' ? result.confidence : '',
    ];

    const key = unverified ? 'UNVERIFIED' : result.verdict;
    const verdictCell = row.getCell(6);
    verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[key] } };
    verdictCell.font = { bold: true, color: { argb: FONT_COLOR[key] } };
    verdictCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (unverified) {
      // The form has only three states, so "not verified" cannot be its own
      // value — it is annotated on the cell instead of inventing a fourth.
      verdictCell.note = 'הקריטריון לא אומת בבדיקה אוטומטית ודורש בדיקה ידנית. אינו מהווה ממצא של אי-עמידה.';
    }

    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.commit();
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(r - 1, 3), column: 9 } };
}

function findingsText(result: CheckResult): string {
  const parts: string[] = [];
  if (result.noteHe) parts.push(result.noteHe);
  for (const f of result.findings.slice(0, 20)) {
    parts.push(`• ${f.locator}\n  ${f.reasonHe}${f.snippet ? `\n  ${clip(f.snippet, 200)}` : ''}`);
  }
  if (result.findings.length > 20) parts.push(`ועוד ${result.findings.length - 20} ממצאים.`);
  // Excel truncates cell text above 32767 characters.
  return clip(parts.join('\n'), 32_000);
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.HEADER } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' },
    };
  });
  row.commit();
}

function title(ws: ExcelJS.Worksheet, cell: string, text: string): void {
  ws.getCell(cell).value = text;
  ws.getCell(cell).font = { bold: true, size: 14 };
}

function kv(ws: ExcelJS.Worksheet, rowNumber: number, key: string, value: string): void {
  ws.getCell(`A${rowNumber}`).value = key;
  ws.getCell(`A${rowNumber}`).font = { bold: true };
  ws.getCell(`B${rowNumber}`).value = value;
}

/**
 * Excel sheet names cannot exceed 31 characters, must be unique, and cannot
 * contain : \ / ? * [ ] — a page title violates all three constraints often
 * enough that this has to be defensive rather than best-effort.
 */
function uniqueSheetName(target: TargetReport, used: Set<string>): string {
  const base = (target.name || target.url)
    .replace(/[:\\/?*[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  let name = base.slice(0, 31) || 'עמוד';
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
