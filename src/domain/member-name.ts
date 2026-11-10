/**
 * MemberNFT name rules that the browser can decide without a chain read.
 * The contract remains authoritative: mint() re-validates the (possibly
 * dev-prefixed) name, and a rejected transaction is still handled by the page.
 *
 * UX spec §3.3: length is UTF-8 bytes, never `maxLength` characters — a Chinese
 * character is 3 bytes and must not be cut in half.
 */

/** UTF-8 byte length, the unit MAX_NAME_LENGTH and calculateMintCost use. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Code points MemberNFT._isValidNameChars rejects: C0/C1 controls, ASCII and
 * ideographic spaces, NBSP, soft hyphen, zero-width/bidi controls and the
 * Unicode filler points. Combining marks are intentionally allowed (the
 * contract only rejects the explicit list); anything not blocked here is still
 * checked by mint().
 */
function isBlockedCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x20) return true;
  if (codePoint === 0x7f) return true;
  if (codePoint >= 0x80 && codePoint <= 0xa0) return true;
  if (codePoint === 0xad || codePoint === 0x34f || codePoint === 0x61c) return true;
  if (codePoint === 0x115f || codePoint === 0x1160) return true;
  if (codePoint === 0x1680 || codePoint === 0x180e) return true;
  if (codePoint >= 0x2000 && codePoint <= 0x200f) return true;
  if (codePoint >= 0x2028 && codePoint <= 0x202f) return true;
  if (codePoint >= 0x205f && codePoint <= 0x206f) return true;
  if (codePoint === 0x2080 || codePoint === 0x3000) return true;
  if (codePoint === 0x3164 || codePoint === 0xfeff || codePoint === 0xffa0) return true;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return true;
  return false;
}

/** True when every code point survives MemberNFT._isValidNameChars. */
export function isMemberNameCharacterValid(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (isBlockedCodePoint(codePoint)) return false;
  }
  return true;
}
