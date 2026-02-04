import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('../../src/services/signal');
jest.mock('../../src/services/migration');

import { statusCommand } from '../../src/commands/status';
import { SignalService } from '../../src/services/signal';
import { MigrationService } from '../../src/services/migration';

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('statusCommand', () => {
  let mockSignal: jest.Mocked<SignalService>;
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();

    mockSignal = {
      verifyConnection: jest.fn().mockResolvedValue(true),
      getGroupInfo: jest.fn(),
      createGroup: jest.fn(),
      setGroupAvatar: jest.fn(),
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

  it('exits early when migration.json does not exist', async () => {
    mockMigration.exists.mockReturnValue(false);

    await statusCommand();

    expect(mockMigration.getGroups).not.toHaveBeenCalled();
  });

  it('displays status for all groups', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    mockMigration.getGroups.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Pending Group',
        description: '',
        memberCount: 3,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending',
      },
      {
        waGroupId: '2@g.us',
        name: 'Skipped Group',
        description: '',
        memberCount: 2,
        members: [],
        avatarPath: null,
        migrate: false,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending',
      },
    ]);

    await statusCommand();

    expect(mockMigration.save).toHaveBeenCalled();
  });

  it('auto-marks groups as completed when Signal members >= WA members', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    mockSignal.getGroupInfo.mockResolvedValue({
      name: 'Family',
      memberCount: 5,
      inviteLink: 'https://signal.group/#abc',
    });

    const group = {
      waGroupId: '1@g.us',
      name: 'Family',
      description: '',
      memberCount: 5,
      members: [],
      avatarPath: null,
      migrate: true,
      signalGroupId: 'sig-1',
      signalInviteLink: 'https://signal.group/#abc',
      status: 'notified' as const,
    };
    mockMigration.getGroups.mockReturnValue([group]);

    await statusCommand();

    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', { status: 'completed' });
  });

  it('does not auto-complete groups that are not yet notified', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    mockSignal.getGroupInfo.mockResolvedValue({
      name: 'Family',
      memberCount: 10,
      inviteLink: 'https://signal.group/#abc',
    });

    const group = {
      waGroupId: '1@g.us',
      name: 'Family',
      description: '',
      memberCount: 5,
      members: [],
      avatarPath: null,
      migrate: true,
      signalGroupId: 'sig-1',
      signalInviteLink: 'https://signal.group/#abc',
      status: 'signal_created' as const,
    };
    mockMigration.getGroups.mockReturnValue([group]);

    await statusCommand();

    expect(mockMigration.updateGroup).not.toHaveBeenCalled();
  });

  it('handles Signal API being unavailable gracefully', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    mockMigration.getGroups.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Test',
        description: '',
        memberCount: 3,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#abc',
        status: 'notified',
      },
    ]);

    // Should not throw
    await statusCommand();

    expect(mockMigration.save).toHaveBeenCalled();
  });

  it('handles Signal getGroupInfo failure gracefully', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );

    mockSignal.getGroupInfo.mockRejectedValue(new Error('timeout'));

    mockMigration.getGroups.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Unreachable',
        description: '',
        memberCount: 5,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: 'sig-1',
        signalInviteLink: 'https://signal.group/#abc',
        status: 'notified',
      },
    ]);

    // Should not throw
    await statusCommand();

    // Should not auto-complete since we couldn't fetch info
    expect(mockMigration.updateGroup).not.toHaveBeenCalled();
  });
});
