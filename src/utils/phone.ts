import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Normalize a phone number to E.164 format (+31612345678).
 * Handles WhatsApp's format (31612345678@s.whatsapp.net) and local Dutch formats (06...).
 */
export function normalizePhone(input: string, defaultRegion = 'NL'): string {
  // Strip WhatsApp JID suffix
  let cleaned = input.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');

  // If it's purely digits (no +), add + prefix for parsing
  if (/^\d+$/.test(cleaned)) {
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
 */
export function phoneFromJid(jid: string): string {
  return normalizePhone(jid);
}

/**
 * Check if a JID is a group JID.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}
