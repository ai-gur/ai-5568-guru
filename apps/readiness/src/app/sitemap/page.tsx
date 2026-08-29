import Link from 'next/link';
import type { Metadata } from 'next';
import { EditorialSection, PageHero } from '@/components/page-components';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'מפת אתר' };

/* 2.4.5 — one of the "multiple ways" the criterion asks for. */
export default function Sitemap() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <PageHero
          title="מפת אתר"
          descriptor="כל העמודים במקום אחד"
          lead="דרך נוספת לאיתור תוכן מלבד תפריט הניווט."
        />
        <EditorialSection tone="cream">
          <dl className="sitemap-list">
            <div>
              <dt>
                <Link href="/">סריקה</Link>
              </dt>
              <dd>הזנת כתובת והרצת סקירת מוכנות.</dd>
            </div>
            <div>
              <dt>
                <Link href="/reviews/demo">דוח לדוגמה</Link>
              </dt>
              <dd>כיצד נראית תוצאה.</dd>
            </div>
            <div>
              <dt>
                <Link href="/domains">דומיינים</Link>
              </dt>
              <dd>אימות בעלות על דומיין לפני סריקה מלאה.</dd>
            </div>
            <div>
              <dt>
                <Link href="/accessibility">הצהרת נגישות</Link>
              </dt>
              <dd>ההתאמות שבוצעו, המגבלות הידועות ופרטי רכז הנגישות, לפי תקנה 35ה.</dd>
            </div>
          </dl>
        </EditorialSection>
      </main>
    </ProductShell>
  );
}
