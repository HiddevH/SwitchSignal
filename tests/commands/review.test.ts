jest.mock('../../src/services/migration');
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

import inquirer from 'inquirer';
import { reviewCommand } from '../../src/commands/review';
import { MigrationService } from '../../src/services/migration';

const mockPrompt = inquirer.prompt as unknown as jest.Mock;

describe('reviewCommand', () => {
  let mockMigration: jest.Mocked<MigrationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();

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

  it('exits early when migration.json does not exist', async () => {
    mockMigration.exists.mockReturnValue(false);

    await reviewCommand();

    expect(mockMigration.getGroups).not.toHaveBeenCalled();
  });

  it('exits early when no groups found', async () => {
    mockMigration.getGroups.mockReturnValue([]);

    await reviewCommand();

    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it('includes readiness info in group selection choices', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Ready Group',
        description: '',
        memberCount: 3,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
        readiness: {
          total: 3,
          onSignal: 3,
          missing: [],
          percentage: 100,
          status: 'ready' as const,
          checkedAt: '2026-01-01T00:00:00Z',
        },
      },
      {
        waGroupId: '2@g.us',
        name: 'Not Ready Group',
        description: '',
        memberCount: 5,
        members: [],
        avatarPath: null,
        migrate: false,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
        readiness: {
          total: 5,
          onSignal: 2,
          missing: [
            { phone: '+31699999991', name: 'X' },
            { phone: '+31699999992', name: 'Y' },
            { phone: '+31699999993', name: 'Z' },
          ],
          percentage: 40,
          status: 'not_ready' as const,
          checkedAt: '2026-01-01T00:00:00Z',
        },
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);

    // User selects the ready group only, then declines renaming
    mockPrompt
      .mockResolvedValueOnce({ selectedGroups: ['1@g.us'] })
      .mockResolvedValueOnce({ wantRename: false });

    await reviewCommand();

    // Verify the prompt choices contain readiness info
    const promptCall = mockPrompt.mock.calls[0][0][0];
    const choiceNames = promptCall.choices.map((c: any) => c.name);

    // Ready group should show "3/3 on Signal"
    expect(choiceNames[0]).toContain('3/3 on Signal');

    // Not ready group should show "2/5 on Signal"
    expect(choiceNames[1]).toContain('2/5 on Signal');
  });

  it('works without readiness data', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'No Readiness',
        description: '',
        memberCount: 4,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);

    mockPrompt
      .mockResolvedValueOnce({ selectedGroups: ['1@g.us'] })
      .mockResolvedValueOnce({ wantRename: false });

    await reviewCommand();

    // Prompt should still work, just without readiness label
    const promptCall = mockPrompt.mock.calls[0][0][0];
    const choiceName = promptCall.choices[0].name;
    expect(choiceName).toContain('No Readiness');
    expect(choiceName).toContain('4 members');
    expect(choiceName).not.toContain('on Signal');
  });

  it('shows compatibility hint when readiness data exists', async () => {
    const groups = [
      {
        waGroupId: '1@g.us',
        name: 'Group',
        description: '',
        memberCount: 3,
        members: [],
        avatarPath: null,
        migrate: true,
        signalGroupId: null,
        signalInviteLink: null,
        status: 'pending' as const,
        readiness: {
          total: 3,
          onSignal: 3,
          missing: [],
          percentage: 100,
          status: 'ready' as const,
          checkedAt: '2026-01-01T00:00:00Z',
        },
      },
    ];
    mockMigration.getGroups.mockReturnValue(groups);

    mockPrompt
      .mockResolvedValueOnce({ selectedGroups: ['1@g.us'] })
      .mockResolvedValueOnce({ wantRename: false });

    await reviewCommand();

    const logCalls = (console.log as jest.Mock).mock.calls.map((c) => c[0]).join('\n');
    expect(logCalls).toContain('Signal compatibility');
  });
});
