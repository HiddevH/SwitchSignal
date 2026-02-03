import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Normalize a phone number to E.164 format (+31612345678).
 * Handles WhatsApp's format (31612345678@s.whatsapp.net) and local formats (06...).
 *
 * The defaultRegion parameter is used to interpret local numbers (those starting
 * with 0). Pass a 2-letter ISO country code like 'US', 'NL', 'DE', 'GB', etc.
 * WhatsApp JIDs already contain international numbers so they work without a region.
 */
export function normalizePhone(input: string, defaultRegion?: string): string {
  // Strip WhatsApp JID suffix
  let cleaned = input.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');

  // If it's purely digits and looks like an international number (not starting with 0),
  // add + prefix for parsing. Local numbers starting with 0 should be parsed with region.
  if (/^\d+$/.test(cleaned) && !cleaned.startsWith('0')) {
    cleaned = '+' + cleaned;
  }

  try {
    const parsed = phoneUtil.parse(cleaned, defaultRegion);
    if (!phoneUtil.isValidNumber(parsed)) {
      // Fall back: return cleaned with + prefix
      return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
    }
    return phoneUtil.format(parsed, PhoneNumberFormat.E164);
  } catch {
    // If parsing fails, return best-effort normalization
    return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  }
}

/**
 * Extract phone number from a WhatsApp JID.
 * e.g. "31612345678@s.whatsapp.net" -> "+31612345678"
 *
 * WhatsApp JIDs always contain international numbers, so no region is needed.
 */
export function phoneFromJid(jid: string): string {
  return normalizePhone(jid);
}

/**
 * Derive the ISO 3166-1 alpha-2 region code from an E.164 phone number.
 * Returns undefined if the number can't be parsed.
 */
export function regionFromPhone(phone: string): string | undefined {
  try {
    const parsed = phoneUtil.parse(phone);
    return phoneUtil.getRegionCodeForNumber(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a JID is a group JID.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}
