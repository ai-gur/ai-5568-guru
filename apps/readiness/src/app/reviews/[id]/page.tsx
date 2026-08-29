import type { Metadata } from 'next';
import { ProductShell } from '@/components/product-shell';
import { ReviewView } from './review-view';

export const metadata: Metadata = { title: 'סקירה' };

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <h1>סקירת מוכנות</h1>
        <ReviewView id={id} />
      </main>
    </ProductShell>
  );
}
