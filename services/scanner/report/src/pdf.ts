/**
 * Accessible (tagged) PDF export of the HTML report.
 *
 * A compliance report distributed as an untagged PDF fails IS 5568 part 2 —
 * criteria 1.3.1 (structure), 1.3.2 (reading order) and 2.4.2 (document name)
 * all depend on the tag tree. So this does not use Playwright's `page.pdf()`,
 * which produces an untagged file: it drives Chromium's `Page.printToPDF` over
 * CDP with `generateTaggedPDF`, then hands the result to the Python sidecar to
 * set `/Lang`, the XMP title, and `DisplayDocTitle` — none of which Chromium
 * writes on its own.
 *
 * The output is verified by running our own part 2 checks over it
 * (`npm run verify:self`), so this claim is tested rather than asserted.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const POSTPROCESS = resolve(HERE, '../../sidecar/postprocess_pdf.py');

export async function writeTaggedPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const html = await readFile(htmlPath, 'utf8');
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim() ?? 'דוח נגישות ת"י 5568';

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch {
    browser = await chromium.launch();
  }

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'load' });

    // Playwright's page.pdf() does not expose generateTaggedPDF, so the CDP
    // command is issued directly.
    const client = await context.newCDPSession(page);
    const result = (await client.send('Page.printToPDF', {
      printBackground: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
      preferCSSPageSize: false,
      paperWidth: 8.27, // A4
      paperHeight: 11.69,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
    } as Record<string, unknown>)) as { data: string };

    const { writeFile } = await import('node:fs/promises');
    await writeFile(pdfPath, Buffer.from(result.data, 'base64'));
  } finally {
    await browser.close().catch(() => undefined);
  }

  await postprocess(pdfPath, title);
}

/**
 * Sets the metadata Chromium omits. Failing here leaves a tagged but
 * incompletely-labelled PDF, which is a real part 2 finding — so it throws
 * rather than passing silently.
 */
function postprocess(pdfPath: string, title: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const child = spawn(python, [POSTPROCESS, pdfPath, '--title', title, '--lang', 'he-IL'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => (stderr += c));

    child.on('error', (err) =>
      reject(
        new Error(
          `לא ניתן להריץ את מעבד ה-PDF (${python}): ${err.message}. ` +
            'ה-PDF נוצר אך ללא כותרת, שפה והגדרת DisplayDocTitle — כשל בקריטריון 2.4.2 של חלק 2.',
        ),
      ),
    );
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`מעבד ה-PDF נכשל (קוד ${code}): ${stderr.slice(0, 400)}`)),
    );
  });
}
