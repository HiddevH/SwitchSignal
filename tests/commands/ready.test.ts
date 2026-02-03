import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('../../src/services/signal');
jest.mock('../../src/services/migration');

import { readyCommand } from '../../src/commands/ready';
import { SignalService } from '../../src/services/signal';
import { MigrationService } from '../../src/services/migration';

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('readyCommand', () => {
  let mockSignal: jest.Mocked<SignalService>;
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

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
      getGroupsToMigrate: jest.fn().mockReturnValue([]),
      getGroupsPendingCreation: jest.fn().mockReturnValue([]),
      getGroupsPendingNotification: jest.fn().mockReturnValue([]),
      setGroups: jest.fn(),
      getState: jest.fn().mockReturnValue({ scannedAt: '', groups: [] }),
    } as any;
    (MigrationService as jest.MockedClass<typeof MigrationService>).mockImplementation(() => mockMigration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exits early when no config file found', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    await readyCommand();

    expect(SignalService).not.toHaveBeenCalled();
  });

  it('exits early when migration.json does not exist', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockMigration.exists.mockReturnValue(false);

    await readyCommand();

    expect(mockSignal.checkRegistrationBatch).not.toHaveBeenCalled();
  });

  it('exits early when Signal API is unreachable', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockSignal.verifyConnection.mockResolvedValue(false);

    await readyCommand();

    expect(mockSignal.checkRegistrationBatch).not.toHaveBeenCalled();
  });

  it('exits when no groups found', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockMigration.getGroups.mockReturnValue([]);

    await readyCommand();

    expect(mockSignal.checkRegistrationBatch).not.toHaveBeenCalled();
  });

  it('checks registration and computes readiness for groups', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Full Group',
        description: '',
        memberCount: 2,
        members: [
          { phone: '+31612345678', name: 'Alice', isAdmin: true },
          { phone: '+31687654321', name: 'Bob', isAdmin: false },
        ],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
      {
        waGroupId: '2@g.us',
        name: 'Half Group',
        description: '',
        memberCount: 2,
        members: [
          { phone: '+31612345678', name: 'Alice', isAdmin: true },
          { phone: '+31699999999', name: 'Charlie', isAdmin: false },
        ],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);

    // Alice and Bob are on Signal, Charlie is not
    const registrationMap = new Map([
      ['+31612345678', true],
      ['+31687654321', true],
      ['+31699999999', false],
    ]);
    mockSignal.checkRegistrationBatch.mockResolvedValue(registrationMap);

    await readyCommand();

    // Should update both groups with readiness data
    expect(mockMigration.updateGroup).toHaveBeenCalledTimes(2);

    // First group: all members on Signal = "ready"
    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      readiness: expect.objectContaining({
        total: 2,
        onSignal: 2,
        percentage: 100,
        status: 'ready',
        missing: [],
      }),
    });

    // Second group: 1 of 2 on Signal = "not_ready" (50%)
    expect(mockMigration.updateGroup).toHaveBeenCalledWith('2@g.us', {
      readiness: expect.objectContaining({
        total: 2,
        onSignal: 1,
        percentage: 50,
        status: 'not_ready',
        missing: [{ phone: '+31699999999', name: 'Charlie' }],
      }),
    });

    expect(mockMigration.save).toHaveBeenCalled();
  });

  it('deduplicates phone numbers before checking', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Group A',
        description: '',
        memberCount: 1,
        members: [{ phone: '+31612345678', name: 'Alice', isAdmin: true }],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
      {
        waGroupId: '2@g.us',
        name: 'Group B',
        description: '',
        memberCount: 1,
        members: [{ phone: '+31612345678', name: 'Alice', isAdmin: false }],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);
    mockSignal.checkRegistrationBatch.mockResolvedValue(new Map([['+31612345678', true]]));

    await readyCommand();

    // The command deduplicates before calling checkRegistrationBatch
    expect(mockSignal.checkRegistrationBatch).toHaveBeenCalledWith(
      ['+31612345678'],
      10,
      expect.any(Function)
    );
  });

  it('classifies groups at 80% threshold as "almost"', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    const members = Array.from({ length: 10 }, (_, i) => ({
      phone: `+3161000000${i}`,
      name: `User ${i}`,
      isAdmin: i === 0,
    }));

    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Almost Group',
        description: '',
        memberCount: 10,
        members,
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);

    // 9 out of 10 registered = 90% = "almost"
    const registrationMap = new Map<string, boolean>();
    for (let i = 0; i < 10; i++) {
      registrationMap.set(`+3161000000${i}`, i < 9);
    }
    mockSignal.checkRegistrationBatch.mockResolvedValue(registrationMap);

    await readyCommand();

    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      readiness: expect.objectContaining({
        total: 10,
        onSignal: 9,
        percentage: 90,
        status: 'almost',
        missing: [{ phone: '+31610000009', name: 'User 9' }],
      }),
    });
  });
});
