import type { Metadata } from 'next';
import { PageHero } from '@/components/page-components';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'דוח לדוגמה' };

export default function DemoReview() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <PageHero
          title="דוח לדוגמה"
          descriptor="בקרוב"
          lead="העמוד ממתין לחיבור הסורק. עד אז הוא ריק בכוונה — דוח לדוגמה עם נתונים מומצאים היה מלמד על המוצר בדיוק את הדבר שהוא מבקש לא לעשות."
        />
      </main>
    </ProductShell>
  );
}
