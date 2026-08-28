import Link from 'next/link';
import type { ReactNode } from 'react';
import { PreferencesControl } from '@/components/preferences-control';

export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI 5568 Guru, דף הבית">
          <strong translate="no">AI 5568 Guru</strong>
          <span>סקירת מוכנות לתקן</span>
        </Link>
        <nav aria-label="ניווט ראשי">
          <Link href="/">סריקה</Link>
          <Link href="/reviews/demo">דוח לדוגמה</Link>
          <Link href="/domains">דומיינים</Link>
          <Link href="/accessibility">הצהרת נגישות</Link>
          <Link href="/sitemap">מפת אתר</Link>
        </nav>
        <PreferencesControl />
      </header>
      {children}
      <footer className="footer">
        <div className="footer-inner">
          <span translate="no">AI 5568 Guru</span>
          <span>
            <Link href="/accessibility">הצהרת נגישות</Link> · סקירה אוטומטית אינה אודיט ואינה תחליף לבודק נגישות מוסמך.
          </span>
        </div>
      </footer>
    </div>
  );
}
