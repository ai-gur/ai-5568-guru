/**
 * Where an artifact is stored, and therefore how long it lives.
 *
 * Retention in R2 is driven by key prefix. That makes the prefix a policy
 * decision wearing the costume of a string, and a string is exactly the kind of
 * thing that gets typed slightly differently six months later — at which point
 * the rule silently stops applying and nobody finds out until a screenshot from
 * three years ago turns up in a subject access request.
 *
 * So keys are built here, and the retention each prefix carries is written next
 * to it.
 *
 * ┌──────────────┬──────────┬──────────────────────────────────────────────┐
 * │ prefix       │ retained │ why                                          │
 * ├──────────────┼──────────┼──────────────────────────────────────────────┤
 * │ screenshots/ │ 90 days  │ Highest privacy exposure, lowest long-term    │
 * │              │          │ value. They are evidence for a finding at a   │
 * │              │          │ moment; once it is fixed they are noise. A    │
 * │              │          │ reviewed site may show user content, names or │
 * │              │          │ faces we never needed to keep.                │
 * │ reports/     │ 1 year   │ The customer's deliverable. They may want to  │
 * │              │          │ show it to an assessor later.                 │
 * │ data/        │ kept     │ The delta baseline. Small, no images, and     │
 * │              │          │ deleting it destroys the ability to show that  │
 * │              │          │ anything improved.                            │
 * └──────────────┴──────────┴──────────────────────────────────────────────┘
 *
 * Two rules that hold regardless of the table: a deletion request is honoured
 * immediately, and nothing expires without the customer being told first. A
 * report someone intends to rely on must not quietly disappear.
 */

export const ARTIFACT_PREFIX = {
  /** Expires after 90 days. */
  screenshot: 'screenshots/',
  /** Expires after 365 days. */
  rendered: 'reports/',
  /** No expiry rule. Required for delta comparison. */
  data: 'data/',
} as const;

export type ArtifactKind = keyof typeof ARTIFACT_PREFIX;

/** Which bucket prefix a given report format belongs under. */
export function artifactKindFor(format: string): ArtifactKind {
  if (format === 'screenshot') return 'screenshot';
  if (format === 'json' || format === 'fix_plan') return 'data';
  return 'rendered';
}

/**
 * Build the object key.
 *
 * Run id first so every artifact of one review sits together, which is what
 * makes "delete this review" a prefix operation rather than a search.
 */
export function artifactKey(runId: string, format: string, filename: string): string {
  const safe = filename
    // Separators and anything exotic become underscores.
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Then collapse dot runs. Stripping separators alone leaves `..` intact —
    // harmless as a literal name, but it is the sequence every path normaliser
    // is looking for, and some object clients do normalise. Removing the
    // sequence is cheaper than reasoning about which ones.
    .replace(/\.{2,}/g, '.')
    // A leading dot or dash makes a hidden or option-like filename on the way
    // back out, when someone downloads it.
    .replace(/^[.\-_]+/, '')
    .slice(0, 120);

  const name = safe.length > 0 ? safe : 'artifact';
  return `${ARTIFACT_PREFIX[artifactKindFor(format)]}${runId}/${name}`;
}
