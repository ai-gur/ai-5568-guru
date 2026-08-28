/**
 * Minimal ZIP reader for .xlsx parts.
 *
 * The importer runs before dependencies are installed (it is what produces the
 * catalogue the rest of the build reads), so it cannot pull in a zip library.
 * An .xlsx only ever uses stored (0) or deflate (8) entries, both of which
 * Node's zlib handles directly.
 *
 * Reads the central directory rather than scanning local headers, so entries
 * with streamed sizes (bit 3 of the general-purpose flags) still work.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;

export function strFromU8(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
}

function findEocd(view: DataView, buf: Uint8Array): number {
  // The comment field means the EOCD is not necessarily the last 22 bytes.
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error('Not a ZIP archive: end-of-central-directory record not found');
}

export function unzipSync(buf: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = findEocd(view, buf);

  let entryCount = view.getUint16(eocd + 10, true);
  let cenOffset = view.getUint32(eocd + 16, true);

  // ZIP64: the 32-bit fields saturate and the real values live in a separate record.
  if (cenOffset === 0xffffffff || entryCount === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && view.getUint32(locator, true) === EOCD64_LOCATOR_SIG) {
      const eocd64 = Number(view.getBigUint64(locator + 8, true));
      if (view.getUint32(eocd64, true) === EOCD64_SIG) {
        entryCount = Number(view.getBigUint64(eocd64 + 32, true));
        cenOffset = Number(view.getBigUint64(eocd64 + 48, true));
      }
    }
  }

  const out: Record<string, Uint8Array> = {};
  let p = cenOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== CEN_SIG) {
      throw new Error(`Corrupt ZIP: expected central directory entry ${i} at offset ${p}`);
    }
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = strFromU8(buf.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats the name/extra with its own lengths — the central
    // directory's values do not necessarily match, so re-read them here.
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      out[name] = raw;
    } else if (method === 8) {
      out[name] = new Uint8Array(inflateRawSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)));
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for entry "${name}"`);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
