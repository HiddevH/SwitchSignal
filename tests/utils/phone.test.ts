import { normalizePhone, phoneFromJid, isGroupJid, regionFromPhone } from '../../src/utils/phone';

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

  it('handles local number with explicit region', () => {
    expect(normalizePhone('0612345678', 'NL')).toBe('+31612345678');
    expect(normalizePhone('02012345678', 'GB')).toBe('+442012345678');
    expect(normalizePhone('015112345678', 'DE')).toBe('+4915112345678');
  });

  it('handles number that is already E.164', () => {
    expect(normalizePhone('+31687654321')).toBe('+31687654321');
  });

  it('works without region for international numbers', () => {
    // International numbers with + should always work regardless of region
    expect(normalizePhone('+14155551234')).toBe('+14155551234');
    expect(normalizePhone('+442012345678')).toBe('+442012345678');
    expect(normalizePhone('+81312345678')).toBe('+81312345678');
  });

  it('works without region for WhatsApp JIDs (international format)', () => {
    // WhatsApp JIDs always use international format, no region needed
    expect(normalizePhone('14155551234@s.whatsapp.net')).toBe('+14155551234');
    expect(normalizePhone('442012345678@s.whatsapp.net')).toBe('+442012345678');
  });

  it('handles Brazilian number', () => {
    expect(normalizePhone('+5511912345678', 'BR')).toBe('+5511912345678');
  });

  it('handles Indian number', () => {
    expect(normalizePhone('+919876543210', 'IN')).toBe('+919876543210');
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

describe('regionFromPhone', () => {
  it('detects NL from a Dutch number', () => {
    expect(regionFromPhone('+31612345678')).toBe('NL');
  });

  it('detects US from an American number', () => {
    expect(regionFromPhone('+14155551234')).toBe('US');
  });

  it('detects GB from a British number', () => {
    expect(regionFromPhone('+442012345678')).toBe('GB');
  });

  it('detects DE from a German number', () => {
    expect(regionFromPhone('+4915112345678')).toBe('DE');
  });

  it('detects BR from a Brazilian number', () => {
    expect(regionFromPhone('+5511912345678')).toBe('BR');
  });

  it('detects JP from a Japanese number', () => {
    expect(regionFromPhone('+81312345678')).toBe('JP');
  });

  it('detects IN from an Indian number', () => {
    expect(regionFromPhone('+919876543210')).toBe('IN');
  });

  it('returns undefined for invalid input', () => {
    expect(regionFromPhone('not-a-number')).toBeUndefined();
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
