import * as fs from 'fs';

// Mock Baileys before any imports that reference it
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  useMultiFileAuthState: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('../../src/services/whatsapp');
jest.mock('../../src/services/signal');
jest.mock('../../src/services/migration');
jest.mock('../../src/utils/delay', () => ({
  humanDelay: jest.fn().mockResolvedValue(undefined),
  withRetry: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import { scanCommand } from '../../src/commands/scan';
import { WhatsAppService } from '../../src/services/whatsapp';
import { SignalService } from '../../src/services/signal';
import { MigrationService } from '../../src/services/migration';

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('scanCommand', () => {
  let mockWa: jest.Mocked<WhatsAppService>;
  let mockSignal: jest.Mocked<SignalService>;
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockWa = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      connect: jest.fn().mockResolvedValue(undefined),
      getGroups: jest.fn().mockResolvedValue([]),
      extractMembers: jest.fn().mockReturnValue([]),
      downloadAvatar: jest.fn().mockResolvedValue(null),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getGroupMetadata: jest.fn(),
      sendMessage: jest.fn(),
      sendPersonalMessage: jest.fn(),
    } as any;
    (WhatsAppService as jest.MockedClass<typeof WhatsAppService>).mockImplementation(() => mockWa);

    mockSignal = {
      verifyConnection: jest.fn().mockResolvedValue(true),
      checkRegistrationBatch: jest.fn().mockResolvedValue(new Map()),
      getUserStatus: jest.fn(),
      createGroup: jest.fn(),
      setGroupAvatar: jest.fn(),
      getGroupInfo: jest.fn(),
      listGroups: jest.fn(),
    } as any;
    (SignalService as jest.MockedClass<typeof SignalService>).mockImplementation(() => mockSignal);

    mockMigration = {
      exists: jest.fn().mockReturnValue(true),
      getGroups: jest.fn().mockReturnValue([]),
      updateGroup: jest.fn(),
      save: jest.fn(),
      setGroups: jest.fn(),
      getGroupsToMigrate: jest.fn().mockReturnValue([]),
      getGroupsPendingCreation: jest.fn().mockReturnValue([]),
      getGroupsPendingNotification: jest.fn().mockReturnValue([]),
      getState: jest.fn().mockReturnValue({ scannedAt: '', groups: [] }),
    } as any;
    (MigrationService as jest.MockedClass<typeof MigrationService>).mockImplementation(() => mockMigration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exits early when not authenticated', async () => {
    mockWa.isAuthenticated.mockReturnValue(false);

    await scanCommand();

    expect(mockWa.connect).not.toHaveBeenCalled();
  });

  it('scans groups and saves to migration.json', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const waGroups = [
      {
        id: '1@g.us',
        subject: 'Family',
        desc: 'Family group',
        participants: [],
      },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue([
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
    ]);

    await scanCommand();

    expect(mockMigration.setGroups).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          waGroupId: '1@g.us',
          name: 'Family',
          memberCount: 1,
        }),
      ])
    );
    expect(mockMigration.save).toHaveBeenCalled();
  });

  it('runs Signal compatibility check when config exists', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const waGroups = [
      {
        id: '1@g.us',
        subject: 'Family',
        desc: '',
        participants: [],
      },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue([
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
      { phone: '+31687654321', name: 'Bob', isAdmin: false },
    ]);

    const registrationMap = new Map([
      ['+31612345678', true],
      ['+31687654321', false],
    ]);
    mockSignal.checkRegistrationBatch.mockResolvedValue(registrationMap);

    await scanCommand();

    expect(SignalService).toHaveBeenCalledWith('+31600000000', 'http://localhost:8080');
    expect(mockSignal.verifyConnection).toHaveBeenCalled();
    expect(mockSignal.checkRegistrationBatch).toHaveBeenCalledWith(
      expect.arrayContaining(['+31612345678', '+31687654321']),
      10,
      expect.any(Function)
    );

    // Should update groups with readiness data
    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      readiness: expect.objectContaining({
        total: 2,
        onSignal: 1,
        percentage: 50,
        status: 'not_ready',
        missing: [{ phone: '+31687654321', name: 'Bob' }],
      }),
      members: expect.arrayContaining([
        expect.objectContaining({ phone: '+31612345678', signalRegistered: true }),
        expect.objectContaining({ phone: '+31687654321', signalRegistered: false }),
      ]),
    });
  });

  it('marks group as ready when all members are on Signal', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const waGroups = [
      { id: '1@g.us', subject: 'Ready Group', desc: '', participants: [] },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue([
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
      { phone: '+31687654321', name: 'Bob', isAdmin: false },
    ]);

    const registrationMap = new Map([
      ['+31612345678', true],
      ['+31687654321', true],
    ]);
    mockSignal.checkRegistrationBatch.mockResolvedValue(registrationMap);

    await scanCommand();

    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      readiness: expect.objectContaining({
        total: 2,
        onSignal: 2,
        percentage: 100,
        status: 'ready',
        missing: [],
      }),
      members: expect.any(Array),
    });
  });

  it('skips Signal check when config does not exist', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const waGroups = [
      { id: '1@g.us', subject: 'Group', desc: '', participants: [] },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue([
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
    ]);

    await scanCommand();

    expect(SignalService).not.toHaveBeenCalled();
  });

  it('skips Signal check when Signal API is unreachable', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    mockSignal.verifyConnection.mockResolvedValue(false);

    const waGroups = [
      { id: '1@g.us', subject: 'Group', desc: '', participants: [] },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue([
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
    ]);

    await scanCommand();

    expect(mockSignal.checkRegistrationBatch).not.toHaveBeenCalled();
  });

  it('deduplicates phone numbers across groups before Signal check', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const waGroups = [
      { id: '1@g.us', subject: 'Group A', desc: '', participants: [] },
      { id: '2@g.us', subject: 'Group B', desc: '', participants: [] },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);

    // Same person (Alice) in both groups
    mockWa.extractMembers
      .mockReturnValueOnce([
        { phone: '+31612345678', name: 'Alice', isAdmin: true },
        { phone: '+31687654321', name: 'Bob', isAdmin: false },
      ])
      .mockReturnValueOnce([
        { phone: '+31612345678', name: 'Alice', isAdmin: false },
        { phone: '+31699999999', name: 'Charlie', isAdmin: true },
      ]);

    mockSignal.checkRegistrationBatch.mockResolvedValue(
      new Map([
        ['+31612345678', true],
        ['+31687654321', true],
        ['+31699999999', false],
      ])
    );

    await scanCommand();

    // Should deduplicate: only 3 unique numbers
    const callArgs = mockSignal.checkRegistrationBatch.mock.calls[0];
    const uniqueNumbers = callArgs[0];
    expect(uniqueNumbers).toHaveLength(3);
    expect(new Set(uniqueNumbers).size).toBe(3);
  });

  it('classifies groups at 80% threshold as almost', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const members = Array.from({ length: 10 }, (_, i) => ({
      phone: `+3161000000${i}`,
      name: `User ${i}`,
      isAdmin: i === 0,
    }));

    const waGroups = [
      { id: '1@g.us', subject: 'Almost Group', desc: '', participants: [] },
    ];
    mockWa.getGroups.mockResolvedValue(waGroups as any);
    mockWa.extractMembers.mockReturnValue(members);

    // 9 out of 10 on Signal = 90% = "almost"
    const registrationMap = new Map<string, boolean>();
    for (let i = 0; i < 10; i++) {
      registrationMap.set(`+3161000000${i}`, i < 9);
    }
    mockSignal.checkRegistrationBatch.mockResolvedValue(registrationMap);

    await scanCommand();

    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      readiness: expect.objectContaining({
        total: 10,
        onSignal: 9,
        percentage: 90,
        status: 'almost',
      }),
      members: expect.any(Array),
    });
  });
});
