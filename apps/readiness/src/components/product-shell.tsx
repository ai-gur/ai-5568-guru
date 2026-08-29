'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PreferencesControl } from '@/components/preferences-control';

/**
 * The site chrome, built from the AI Guru system rather than beside it.
 *
 * This product is a sub-brand of the same practice, so it uses the same
 * components with the same class names and the same approved lockup — a sticky
 * translucent header, a copper rule under the current page, and the navy
 * footer. Matching the tokens alone was what produced a page in the right
 * colours that still read as a different company's application.
 *
 * See DESIGN.md at C:\AI_Projects\aiguru.co.il\Current.
 */

const NAV = [
  { href: '/', label: 'סריקה' },
  { href: '/reviews/demo', label: 'דוח לדוגמה' },
  { href: '/domains', label: 'דומיינים' },
  { href: '/accessibility', label: 'הצהרת נגישות' },
  { href: '/sitemap', label: 'מפת אתר' },
];

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <header className="site-header">
        <div className="site-header__inner">
          {/*
            The approved lockup, unaltered. Its alt is empty because the link is
            already named by aria-label — describing the image as well makes a
            screen reader announce the brand twice for one control.
          */}
          <Link className="brand-link" href="/" aria-label="AI 5568 Guru, דף הבית">
            <span className="brand-link__mark">
              <Image src="/brand/ai-guru-lockup-primary.svg" width={1417} height={709} priority alt="" />
            </span>
            <span className="brand-link__copy">
              <strong className="brand-link__name" translate="no">
                סקירת מוכנות לת&quot;י 5568
              </strong>
            </span>
          </Link>

          <nav className="primary-navigation" aria-label="ניווט ראשי">
            {NAV.map((item) => {
              // aria-current is what the copper rule is drawn from, so the mark
              // and the announcement can never disagree.
              const current = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <PreferencesControl />
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Image src="/brand/ai-guru-lockup-inverse.svg" width={1417} height={709} alt="AI Guru" />
            <p>
              סקירת מוכנות לת&quot;י 5568 — סריקה והנחיות תיקון לקראת בחינת אודיט על ידי גוף מוסמך.
              הסקירה אינה אודיט ואינה תחליף לבודק נגישות מוסמך.
            </p>
          </div>
          <nav aria-label="ניווט בתחתית האתר">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="site-footer__legal">© {new Date().getFullYear()} Nir Bar, AI Guru</p>
      </footer>
    </div>
  );
}
