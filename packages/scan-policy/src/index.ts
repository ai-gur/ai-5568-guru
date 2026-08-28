/**
 * @ai5568/scan-policy — what may be scanned, and how deep.
 *
 * Shared rather than duplicated because two things enforce it and they must not
 * drift: the web app refuses a request before queuing it, and the scanner
 * refuses again before fetching. Two copies of a security rule is one copy that
 * will be forgotten.
 *
 * Public, like the rest of the catalogue side. A guard whose rules are secret
 * is not stronger — it is only harder for anyone to check.
 */

export { guardUrl, blockedReason, type GuardResult } from './network-guard.ts';
export {
  verifyDomainOwnership,
  verificationToken,
  pageLimitFor,
  SHALLOW_MAX_PAGES,
  WELL_KNOWN_PATH,
  proofCovers,
  type VerificationMethod,
  type VerificationOutcome,
} from './ownership.ts';
