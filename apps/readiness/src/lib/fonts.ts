import localFont from 'next/font/local';
import { Open_Sans } from 'next/font/google';

/**
 * The AI Guru type stack, matched to aiguru.co.il.
 *
 * Frank Ruhl Libre carries editorial hierarchy, Open Sans carries operational
 * text, Playpen Sans Hebrew carries margin notes. Two of the three are variable
 * files rather than Google-hosted, so they are vendored here.
 */

export const editorialFont = localFont({
  src: '../assets/fonts/frank-ruhl-libre-variable.ttf',
  variable: '--font-frank',
  display: 'swap',
  weight: '300 900',
});

export const operationalFont = Open_Sans({
  variable: '--font-open-sans',
  display: 'swap',
  subsets: ['hebrew', 'latin'],
  weight: 'variable',
});

export const annotationFont = localFont({
  src: '../assets/fonts/playpen-sans-hebrew-variable.ttf',
  variable: '--font-playpen',
  display: 'swap',
  weight: '100 800',
});
