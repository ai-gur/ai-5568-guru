import type { ReactNode } from 'react';

/**
 * The layout primitives, mirroring `page-components.tsx` at aiguru.co.il.
 *
 * They exist so a page never writes `section-shell` and `editorial-section`
 * by hand. Repeating the class names per page is how one page ends up
 * full-bleed while the rest are in the shell — which is exactly what happened
 * before these existed.
 */

export function PageHero({
  title,
  descriptor,
  lead,
  children,
}: {
  title: string;
  /** One short human note, set in the annotation face. Never a sentence. */
  descriptor?: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-hero section-shell" aria-labelledby="page-title">
      <div className="page-hero__intro">
        <h1 id="page-title">{title}</h1>
        {descriptor ? <p className="page-hero__descriptor">{descriptor}</p> : null}
        {lead ? <p className="page-hero__lead">{lead}</p> : null}
        {children}
      </div>
    </section>
  );
}

/**
 * A tonal field. `tone` alternates down the page so sections are separated by
 * ground rather than by borders — the Editorial Field Rule.
 */
export function EditorialSection({
  title,
  lead,
  tone = 'paper',
  labelledBy,
  children,
}: {
  title?: string;
  lead?: string;
  tone?: 'paper' | 'cream' | 'warm' | 'navy';
  /** Set when the caller owns the heading and its id. */
  labelledBy?: string;
  children: ReactNode;
}) {
  const headingId = labelledBy ?? (title ? `section-${slug(title)}` : undefined);

  return (
    <section className={`editorial-section editorial-section--${tone}`} aria-labelledby={headingId}>
      <div className="section-shell">
        {title ? (
          <div className="section-heading">
            <h2 id={headingId}>{title}</h2>
            {lead ? <p className="section-lead">{lead}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/**
 * A stable id from a Hebrew heading. `encodeURIComponent` would produce a long
 * percent-escaped string; a hash keeps it short and, more importantly, keeps it
 * the same across renders so `aria-labelledby` never points at nothing.
 */
function slug(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
