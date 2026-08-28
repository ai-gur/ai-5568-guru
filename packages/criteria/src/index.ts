/**
 * @ai5568/criteria — the catalogue, and the vocabulary every consumer speaks.
 *
 * This package is the spine of the product. The scanner, the skill, the
 * WordPress plugin and the knowledge site all describe the same criteria
 * because they all read them from here — never from a copy of their own.
 *
 * Nothing in here imports anything outside this package. That is deliberate:
 * a catalogue that depends on a scanner cannot be consumed by a plugin.
 */

export * from './schema.ts';
export { loadCatalogue, CATALOGUE_PATH } from './load.ts';
export { CATALOGUE_VERSION, EFFECTIVE_FROM, CATALOGUE_SOURCES } from './version.ts';
export { ENGINE_OVERRIDES } from './overrides.ts';
export { NON_FORM_ITEMS, PART2_TEXT_THRESHOLDS } from './part2-and-israeli.ts';
