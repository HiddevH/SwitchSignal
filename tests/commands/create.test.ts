import * as fs from 'fs';

// Mock modules before importing the command
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('../../src/services/signal');
jest.mock('../../src/services/migration');
jest.mock('../../src/utils/delay', () => ({
  humanDelay: jest.fn().mockResolvedValue(undefined),
  withRetry: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import { createCommand } from '../../src/commands/create';
import { SignalService } from '../../src/services/signal';
import { MigrationService } from '../../src/services/migration';
import { withRetry } from '../../src/utils/delay';

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('createCommand', () => {
  let mockSignal: jest.Mocked<SignalService>;
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Setup SignalService mock
    mockSignal = {
      verifyConnection: jest.fn().mockResolvedValue(true),
      createGroup: jest.fn().mockResolvedValue({ id: 'sig-1', inviteLink: 'https://signal.group/#abc' }),
      setGroupAvatar: jest.fn().mockResolvedValue(undefined),
      getGroupInfo: jest.fn(),
      listGroups: jest.fn(),
    } as any;
    (SignalService as jest.MockedClass<typeof SignalService>).mockImplementation(() => mockSignal);

    // Setup MigrationService mock
    mockMigration = {
      exists: jest.fn().mockReturnValue(true),
      getGroupsPendingCreation: jest.fn().mockReturnValue([]),
      updateGroup: jest.fn(),
      save: jest.fn(),
      getGroups: jest.fn().mockReturnValue([]),
      getGroupsToMigrate: jest.fn().mockReturnValue([]),
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

    await createCommand();

    expect(SignalService).not.toHaveBeenCalled();
  });

  it('exits early when migration.json does not exist', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockMigration.exists.mockReturnValue(false);

    await createCommand();

    expect(mockSignal.createGroup).not.toHaveBeenCalled();
  });

  it('exits early when Signal API is unreachable', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockSignal.verifyConnection.mockResolvedValue(false);

    await createCommand();

    expect(mockMigration.getGroupsPendingCreation).not.toHaveBeenCalled();
  });

  it('does nothing when no groups are pending', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockMigration.getGroupsPendingCreation.mockReturnValue([]);

    await createCommand();

    expect(mockSignal.createGroup).not.toHaveBeenCalled();
  });

  it('creates Signal groups for pending groups', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockedFs.existsSync.mockReturnValue(false); // No avatar
    mockMigration.getGroupsPendingCreation.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Family',
        description: 'My family',
        memberCount: 5,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending',
      },
    ]);

    await createCommand();

    expect(mockMigration.updateGroup).toHaveBeenCalledWith('1@g.us', {
      signalGroupId: 'sig-1',
      signalInviteLink: 'https://signal.group/#abc',
      status: 'signal_created',
    });
    expect(mockMigration.save).toHaveBeenCalled();
  });

  it('attempts to set avatar when avatarPath exists', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockedFs.existsSync.mockReturnValue(true);
    mockMigration.getGroupsPendingCreation.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Family',
        description: 'My family',
        memberCount: 5,
        members: [],
        avatarPath: '/tmp/avatar.jpg',
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending',
      },
    ]);

    await createCommand();

    expect(mockSignal.setGroupAvatar).toHaveBeenCalledWith('sig-1', '/tmp/avatar.jpg');
  });

  it('continues with other groups when one fails', async () => {
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ signalNumber: '+31600000000', signalApiUrl: 'http://localhost:8080' })
    );
    mockedFs.existsSync.mockReturnValue(false);

    // Make withRetry throw for the first call, succeed for the second
    (withRetry as jest.Mock)
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce({ id: 'sig-2', inviteLink: 'https://signal.group/#def' });

    mockMigration.getGroupsPendingCreation.mockReturnValue([
      {
        waGroupId: '1@g.us',
        name: 'Failing Group',
        description: 'Will fail',
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
        name: 'Succeeding Group',
        description: 'Will succeed',
        memberCount: 4,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending',
      },
    ]);

    await createCommand();

    // First group failed, second succeeded
    expect(mockMigration.updateGroup).toHaveBeenCalledTimes(1);
    expect(mockMigration.updateGroup).toHaveBeenCalledWith('2@g.us', {
      signalGroupId: 'sig-2',
      signalInviteLink: 'https://signal.group/#def',
      status: 'signal_created',
    });
  });
});
