jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  useMultiFileAuthState: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
}));

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

jest.mock('../../src/services/whatsapp');
jest.mock('../../src/services/migration');
jest.mock('../../src/utils/delay', () => ({
  humanDelay: jest.fn().mockResolvedValue(undefined),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import inquirer from 'inquirer';
import { notifyCommand } from '../../src/commands/notify';
import { WhatsAppService } from '../../src/services/whatsapp';
import { MigrationService } from '../../src/services/migration';

const mockedInquirer = inquirer as jest.Mocked<typeof inquirer>;

describe('notifyCommand', () => {
  let mockWa: jest.Mocked<WhatsAppService>;
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();

    mockWa = {
      connect: jest.fn().mockResolvedValue(undefined),
      sendPersonalMessage: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getGroups: jest.fn(),
      getGroupMetadata: jest.fn(),
      extractMembers: jest.fn(),
      downloadAvatar: jest.fn(),
    } as any;
    (WhatsAppService as jest.MockedClass<typeof WhatsAppService>).mockImplementation(() => mockWa);

    mockMigration = {
      exists: jest.fn().mockReturnValue(true),
      getGroupsPendingNotification: jest.fn().mockReturnValue([]),
      updateGroup: jest.fn(),
      save: jest.fn(),
      getGroups: jest.fn().mockReturnValue([]),
      getGroupsToMigrate: jest.fn().mockReturnValue([]),
      getGroupsPendingCreation: jest.fn().mockReturnValue([]),
      setGroups: jest.fn(),
      getState: jest.fn().mockReturnValue({ scannedAt: '', groups: [] }),
    } as any;
    (MigrationService as jest.MockedClass<typeof MigrationService>).mockImplementation(() => mockMigration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exits early when migration.json does not exist', async () => {
    mockMigration.exists.mockReturnValue(false);

    await notifyCommand();

    expect(mockedInquirer.prompt).not.toHaveBeenCalled();
  });

  it('exits when no groups are pending notification', async () => {
    mockMigration.getGroupsPendingNotification.mockReturnValue([]);

    await notifyCommand();

    expect(mockedInquirer.prompt).not.toHaveBeenCalled();
  });

  it('aborts when user declines confirmation', async () => {
    mockMigration.getGroupsPendingNotification.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Test',
        description: '',
        memberCount: 2,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#abc',
        status: 'signal_created',
      },
    ]);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'en' })
      .mockResolvedValueOnce({ strategy: 'personal' })
      .mockResolvedValueOnce({ confirm: false });

    await notifyCommand();

    expect(mockWa.connect).not.toHaveBeenCalled();
  });

  it('sends personal DMs with personal strategy', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Family',
        description: '',
        memberCount: 2,
        members: [
          { phone: '+31612345678', name: 'Alice', isAdmin: true },
          { phone: '+31687654321', name: 'Bob', isAdmin: false },
        ],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#abc',
        status: 'signal_created' as const,
      },
    ];
    mockMigration.getGroupsPendingNotification.mockReturnValue(groups);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'en' })
      .mockResolvedValueOnce({ strategy: 'personal' })
      .mockResolvedValueOnce({ confirm: true });

    await notifyCommand();

    expect(mockWa.connect).toHaveBeenCalled();
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledTimes(2);
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledWith(
      '+31612345678',
      expect.stringContaining('Family')
    );
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledWith(
      '+31687654321',
      expect.stringContaining('Family')
    );
    // Should NOT send group messages
    expect(mockWa.sendMessage).not.toHaveBeenCalled();
    // Should mark as notified
    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', { status: 'notified' });
    expect(mockMigration.save).toHaveBeenCalled();
    expect(mockWa.disconnect).toHaveBeenCalled();
  });

  it('sends group announcements with group strategy', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Sports',
        description: '',
        memberCount: 3,
        members: [
          { phone: '+31612345678', name: 'Alice', isAdmin: true },
        ],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#sports',
        status: 'signal_created' as const,
      },
    ];
    mockMigration.getGroupsPendingNotification.mockReturnValue(groups);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'nl' })
      .mockResolvedValueOnce({ strategy: 'group' })
      .mockResolvedValueOnce({ confirm: true });

    await notifyCommand();

    expect(mockWa.sendMessage).toHaveBeenCalledWith(
      '1@g.us',
      expect.stringContaining('https://signal.group/#sports')
    );
    // Should NOT send personal messages
    expect(mockWa.sendPersonalMessage).not.toHaveBeenCalled();
  });

  it('sends both personal and group messages with both strategy', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Both Test',
        description: '',
        memberCount: 1,
        members: [
          { phone: '+31612345678', name: 'Alice', isAdmin: true },
        ],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#both',
        status: 'signal_created' as const,
      },
    ];
    mockMigration.getGroupsPendingNotification.mockReturnValue(groups);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'en' })
      .mockResolvedValueOnce({ strategy: 'both' })
      .mockResolvedValueOnce({ confirm: true });

    await notifyCommand();

    expect(mockWa.sendPersonalMessage).toHaveBeenCalled();
    expect(mockWa.sendMessage).toHaveBeenCalled();
  });

  it('aggregates multiple groups per member in personal DMs', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Group A',
        description: '',
        memberCount: 1,
        members: [{ phone: '+31612345678', name: 'Alice', isAdmin: false }],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#a',
        status: 'signal_created' as const,
      },
      {
        waGroupId: '2@g.us',
        name: 'Group B',
        description: '',
        memberCount: 1,
        members: [{ phone: '+31612345678', name: 'Alice', isAdmin: false }],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-2',
        signalInviteLink: 'https://signal.group/#b',
        status: 'signal_created' as const,
      },
    ];
    mockMigration.getGroupsPendingNotification.mockReturnValue(groups);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'en' })
      .mockResolvedValueOnce({ strategy: 'personal' })
      .mockResolvedValueOnce({ confirm: true });

    await notifyCommand();

    // Alice should receive only ONE message with both groups
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledTimes(1);
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledWith(
      '+31612345678',
      expect.stringContaining('Group A')
    );
    expect(mockWa.sendPersonalMessage).toHaveBeenCalledWith(
      '+31612345678',
      expect.stringContaining('Group B')
    );
  });

  it('skips groups without invite links', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'No Link',
        description: '',
        memberCount: 1,
        members: [{ phone: '+31612345678', name: 'Alice', isAdmin: false }],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: null,
        status: 'signal_created' as const,
      },
    ];
    mockMigration.getGroupsPendingNotification.mockReturnValue(groups);

    (mockedInquirer.prompt as unknown as jest.Mock)
      .mockResolvedValueOnce({ language: 'en' })
      .mockResolvedValueOnce({ strategy: 'personal' })
      .mockResolvedValueOnce({ confirm: true });

    await notifyCommand();

    expect(mockWa.sendPersonalMessage).not.toHaveBeenCalled();
  });
});
