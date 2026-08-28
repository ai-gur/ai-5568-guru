import type { Metadata, Viewport } from 'next';
import { annotationFont, editorialFont, operationalFont } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI 5568 Guru | סקירת מוכנות לתקן',
    template: '%s | AI 5568 Guru',
  },
  description:
    'סקירת מוכנות לת"י 5568 לקראת אודיט רשמי. מזהה ליקויים, מסביר איך לתקן — ואינה קובעת עמידה בתקן.',
};

// --navy-deep, the AI Guru system's darkest surface.
export const viewport: Viewport = {
  themeColor: '#1b2f40',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` and `dir` are the two attributes the whole Hebrew reading
    // experience hangs on, and the ones a screen reader needs before anything
    // else. R31 and IL03 check for exactly this on every site we review, so
    // getting them wrong here would be its own kind of answer.
    <html lang="he" dir="rtl" className={`${editorialFont.variable} ${operationalFont.variable} ${annotationFont.variable}`}>
      <body>
        {/* 2.4.1 — the first thing in the tab order, visible on focus. */}
        <a className="skip-link" href="#main">
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
