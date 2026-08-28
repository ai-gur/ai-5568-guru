import type { Metadata } from 'next';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'דוח לדוגמה' };

export default function DemoReview() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <h1>דוח לדוגמה</h1>
        <p className="notice">
          העמוד ממתין לחיבור הסורק. עד אז הוא ריק בכוונה — דוח לדוגמה עם נתונים מומצאים היה מלמד על המוצר
          בדיוק את הדבר שהוא מבקש לא לעשות.
        </p>
      </main>
    </ProductShell>
  );
}
