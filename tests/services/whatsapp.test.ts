// Mock Baileys before any imports that reference it
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  useMultiFileAuthState: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
}));

import { WhatsAppService } from '../../src/services/whatsapp';


// We only test the pure/synchronous methods. Connection-based methods
// require a real Baileys socket which needs WhatsApp auth.

describe('WhatsAppService', () => {
  let service: WhatsAppService;

  beforeEach(() => {
    service = new WhatsAppService();
  });

  describe('extractMembers', () => {
    it('extracts members with correct phone normalization', () => {
      const group = {
        id: '120363001@g.us',
        subject: 'Test Group',
        participants: [
          { id: '31612345678@s.whatsapp.net', notify: 'Alice', admin: 'admin' as const },
          { id: '31687654321@s.whatsapp.net', notify: 'Bob', admin: null },
        ],
      } as any;

      const members = service.extractMembers(group);

      expect(members).toHaveLength(2);
      expect(members[0]).toEqual({
        phone: '+31612345678',
        name: 'Alice',
        isAdmin: true,
      });
      expect(members[1]).toEqual({
        phone: '+31687654321',
        name: 'Bob',
        isAdmin: false,
      });
    });

    it('uses JID prefix as name when notify is missing', () => {
      const group = {
        id: '120363001@g.us',
        subject: 'Test',
        participants: [
          { id: '31699999999@s.whatsapp.net', admin: null },
        ],
      } as any;

      const members = service.extractMembers(group);
      expect(members[0].name).toBe('31699999999');
    });

    it('identifies superadmin as admin', () => {
      const group = {
        id: '120363001@g.us',
        subject: 'Test',
        participants: [
          { id: '31612345678@s.whatsapp.net', notify: 'SuperAdmin', admin: 'superadmin' as const },
        ],
      } as any;

      const members = service.extractMembers(group);
      expect(members[0].isAdmin).toBe(true);
    });

    it('handles empty participant list', () => {
      const group = {
        id: '120363001@g.us',
        subject: 'Empty',
        participants: [],
      } as any;

      const members = service.extractMembers(group);
      expect(members).toEqual([]);
    });

    it('handles many participants', () => {
      const participants = Array.from({ length: 50 }, (_, i) => ({
        id: `316${String(i).padStart(8, '0')}@s.whatsapp.net`,
        notify: `User ${i}`,
        admin: i === 0 ? ('admin' as const) : null,
      }));

      const group = {
        id: '120363001@g.us',
        subject: 'Large Group',
        participants,
      } as any;

      const members = service.extractMembers(group);
      expect(members).toHaveLength(50);
      expect(members[0].isAdmin).toBe(true);
      expect(members[49].isAdmin).toBe(false);
    });
  });

  describe('sendPersonalMessage JID construction', () => {
    it('throws when not connected', async () => {
      await expect(service.sendPersonalMessage('+31612345678', 'hello')).rejects.toThrow(
        'Not connected to WhatsApp'
      );
    });
  });

  describe('getGroups', () => {
    it('throws when not connected', async () => {
      await expect(service.getGroups()).rejects.toThrow('Not connected to WhatsApp');
    });
  });

  describe('sendMessage', () => {
    it('throws when not connected', async () => {
      await expect(service.sendMessage('group@g.us', 'test')).rejects.toThrow(
        'Not connected to WhatsApp'
      );
    });
  });

  describe('downloadAvatar', () => {
    it('throws when not connected', async () => {
      await expect(service.downloadAvatar('group@g.us', '/tmp/test.jpg')).rejects.toThrow(
        'Not connected to WhatsApp'
      );
    });
  });
});
