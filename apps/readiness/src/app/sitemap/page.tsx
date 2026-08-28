import Link from 'next/link';
import type { Metadata } from 'next';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'מפת אתר' };

/* 2.4.5 — one of the "multiple ways" the criterion asks for. */
export default function Sitemap() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <h1>מפת אתר</h1>
        <ul>
          <li><Link href="/">סריקה</Link> — הזנת כתובת והרצת סקירת מוכנות</li>
          <li><Link href="/reviews/demo">דוח לדוגמה</Link> — כיצד נראית תוצאה</li>
          <li><Link href="/accessibility">הצהרת נגישות</Link> — לפי תקנה 35ה</li>
        </ul>
      </main>
    </ProductShell>
  );
}
