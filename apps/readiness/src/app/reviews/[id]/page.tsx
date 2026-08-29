import type { Metadata } from 'next';
import { EditorialSection, PageHero } from '@/components/page-components';
import { ProductShell } from '@/components/product-shell';
import { ReviewView } from './review-view';

export const metadata: Metadata = { title: 'סקירה' };

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <PageHero title="סקירת מוכנות" descriptor="לפני שבודק מוסמך מגיע" />
        {/*
          The report is one continuous field rather than a run of alternating
          tones: it is a work list to read top to bottom, and a change of ground
          every few criteria would read as a change of subject.
        */}
        <EditorialSection tone="cream">
          <ReviewView id={id} />
        </EditorialSection>
      </main>
    </ProductShell>
  );
}
