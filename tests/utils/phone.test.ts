import { normalizePhone, phoneFromJid, isGroupJid } from '../../src/utils/phone';

describe('normalizePhone', () => {
  it('normalizes a full international number with +', () => {
    expect(normalizePhone('+31612345678')).toBe('+31612345678');
  });

  it('normalizes a number without + prefix', () => {
    expect(normalizePhone('31612345678')).toBe('+31612345678');
  });

  it('normalizes a Dutch local number (06...)', () => {
    expect(normalizePhone('0612345678', 'NL')).toBe('+31612345678');
  });

  it('strips WhatsApp @s.whatsapp.net suffix', () => {
    expect(normalizePhone('31612345678@s.whatsapp.net')).toBe('+31612345678');
  });

  it('strips WhatsApp @c.us suffix', () => {
    expect(normalizePhone('31612345678@c.us')).toBe('+31612345678');
  });

  it('handles a US number', () => {
    expect(normalizePhone('+12025551234', 'US')).toBe('+12025551234');
  });

  it('handles a US number without +', () => {
    expect(normalizePhone('12025551234', 'US')).toBe('+12025551234');
  });

  it('handles a German number', () => {
    expect(normalizePhone('+4915112345678', 'DE')).toBe('+4915112345678');
  });

  it('falls back gracefully for an invalid number', () => {
    const result = normalizePhone('abc123');
    // Should still return something with a + prefix
    expect(result.startsWith('+')).toBe(true);
  });

  it('handles WhatsApp JID with international number', () => {
    expect(normalizePhone('4915112345678@s.whatsapp.net', 'DE')).toBe('+4915112345678');
  });

  it('defaults to NL region', () => {
    // A Dutch local number should work with default region
    expect(normalizePhone('0612345678')).toBe('+31612345678');
  });

  it('handles number that is already E.164', () => {
    expect(normalizePhone('+31687654321')).toBe('+31687654321');
  });
});

describe('phoneFromJid', () => {
  it('extracts phone from a standard WhatsApp JID', () => {
    expect(phoneFromJid('31612345678@s.whatsapp.net')).toBe('+31612345678');
  });

  it('extracts phone from a @c.us JID', () => {
    expect(phoneFromJid('31612345678@c.us')).toBe('+31612345678');
  });

  it('handles a JID that is just a number', () => {
    const result = phoneFromJid('31612345678');
    expect(result).toBe('+31612345678');
  });
});

describe('isGroupJid', () => {
  it('returns true for a group JID', () => {
    expect(isGroupJid('120363001234567890@g.us')).toBe(true);
  });

  it('returns false for a user JID', () => {
    expect(isGroupJid('31612345678@s.whatsapp.net')).toBe(false);
  });

  it('returns false for a @c.us JID', () => {
    expect(isGroupJid('31612345678@c.us')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isGroupJid('')).toBe(false);
  });

  it('returns false for a string ending with @g.us but not at end', () => {
    // This is just a string test - @g.us must be at the very end
    expect(isGroupJid('something@g.us.extra')).toBe(false);
  });
});
