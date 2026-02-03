import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationService } from '../../src/services/migration';
import { GroupInfo, MigrationState } from '../../src/types';

function makeGroup(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    waGroupId: '120363001@g.us',
    name: 'Test Group',
    description: 'A test group',
    memberCount: 3,
    members: [
      { phone: '+31612345678', name: 'Alice', isAdmin: true },
      { phone: '+31687654321', name: 'Bob', isAdmin: false },
      { phone: '+31611111111', name: 'Charlie', isAdmin: false },
    ],
    avatarPath: null,
    migrate: true,
    signalGroupId: null,
    signalInviteLink: null,
    status: 'pending',
    ...overrides,
  };
}

describe('MigrationService', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchsignal-test-'));
    filePath = path.join(tmpDir, 'migration.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('initializes empty state when no file exists', () => {
      const svc = new MigrationService(filePath);
      const state = svc.getState();
      expect(state.scannedAt).toBe('');
      expect(state.groups).toEqual([]);
    });

    it('loads existing state from file', () => {
      const existing: MigrationState = {
        scannedAt: '2026-01-01T00:00:00Z',
        groups: [makeGroup()],
      };
      fs.writeFileSync(filePath, JSON.stringify(existing), 'utf-8');

      const svc = new MigrationService(filePath);
      expect(svc.getGroups()).toHaveLength(1);
      expect(svc.getGroups()[0].name).toBe('Test Group');
    });
  });

  describe('exists', () => {
    it('returns false when file does not exist', () => {
      const svc = new MigrationService(filePath);
      expect(svc.exists()).toBe(false);
    });

    it('returns true when file exists', () => {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      const svc = new MigrationService(filePath);
      expect(svc.exists()).toBe(true);
    });
  });

  describe('save and load', () => {
    it('persists state to disk', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup()]);
      svc.save();

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.groups).toHaveLength(1);
      expect(raw.groups[0].name).toBe('Test Group');
    });

    it('writes valid JSON with indentation', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup()]);
      svc.save();

      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).toContain('\n'); // Indented JSON
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('round-trips data correctly', () => {
      const svc1 = new MigrationService(filePath);
      const group = makeGroup({ name: 'Round Trip Test' });
      svc1.setGroups([group]);
      svc1.save();

      const svc2 = new MigrationService(filePath);
      expect(svc2.getGroups()[0].name).toBe('Round Trip Test');
    });
  });

  describe('setGroups', () => {
    it('sets groups and updates scannedAt', () => {
      const svc = new MigrationService(filePath);
      const before = new Date().toISOString();
      svc.setGroups([makeGroup()]);
      const after = new Date().toISOString();

      expect(svc.getState().scannedAt).toBeTruthy();
      expect(svc.getState().scannedAt >= before).toBe(true);
      expect(svc.getState().scannedAt <= after).toBe(true);
    });

    it('replaces previous groups', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ name: 'First' })]);
      expect(svc.getGroups()).toHaveLength(1);

      svc.setGroups([makeGroup({ name: 'Second' }), makeGroup({ name: 'Third', waGroupId: '2@g.us' })]);
      expect(svc.getGroups()).toHaveLength(2);
      expect(svc.getGroups()[0].name).toBe('Second');
    });
  });

  describe('getGroupsToMigrate', () => {
    it('returns only groups with migrate: true', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([
        makeGroup({ waGroupId: '1@g.us', name: 'Yes', migrate: true }),
        makeGroup({ waGroupId: '2@g.us', name: 'No', migrate: false }),
        makeGroup({ waGroupId: '3@g.us', name: 'Also Yes', migrate: true }),
      ]);

      const result = svc.getGroupsToMigrate();
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.name)).toEqual(['Yes', 'Also Yes']);
    });

    it('returns empty array when no groups are marked for migration', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ migrate: false })]);
      expect(svc.getGroupsToMigrate()).toHaveLength(0);
    });
  });

  describe('getGroupsPendingCreation', () => {
    it('returns groups where migrate=true AND status=pending', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([
        makeGroup({ waGroupId: '1@g.us', migrate: true, status: 'pending' }),
        makeGroup({ waGroupId: '2@g.us', migrate: true, status: 'signal_created' }),
        makeGroup({ waGroupId: '3@g.us', migrate: false, status: 'pending' }),
      ]);

      const result = svc.getGroupsPendingCreation();
      expect(result).toHaveLength(1);
      expect(result[0].waGroupId).toBe('1@g.us');
    });
  });

  describe('getGroupsPendingNotification', () => {
    it('returns groups where migrate=true AND status=signal_created', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([
        makeGroup({ waGroupId: '1@g.us', migrate: true, status: 'signal_created' }),
        makeGroup({ waGroupId: '2@g.us', migrate: true, status: 'pending' }),
        makeGroup({ waGroupId: '3@g.us', migrate: true, status: 'notified' }),
      ]);

      const result = svc.getGroupsPendingNotification();
      expect(result).toHaveLength(1);
      expect(result[0].waGroupId).toBe('1@g.us');
    });
  });

  describe('updateGroup', () => {
    it('updates specific fields of a group', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ waGroupId: '1@g.us' })]);

      svc.updateGroup('1@g.us', {
        signalGroupId: 'signal-123',
        signalInviteLink: 'https://signal.group/#abc',
        status: 'signal_created',
      });

      const group = svc.getGroups()[0];
      expect(group.signalGroupId).toBe('signal-123');
      expect(group.signalInviteLink).toBe('https://signal.group/#abc');
      expect(group.status).toBe('signal_created');
      // Original fields preserved
      expect(group.name).toBe('Test Group');
      expect(group.memberCount).toBe(3);
    });

    it('throws when group is not found', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ waGroupId: '1@g.us' })]);

      expect(() => svc.updateGroup('nonexistent@g.us', { status: 'completed' })).toThrow(
        'Group not found: nonexistent@g.us'
      );
    });

    it('can update the name', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ waGroupId: '1@g.us', name: 'Old Name' })]);

      svc.updateGroup('1@g.us', { name: 'New Name' });
      expect(svc.getGroups()[0].name).toBe('New Name');
    });

    it('can toggle migrate flag', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([makeGroup({ waGroupId: '1@g.us', migrate: true })]);

      svc.updateGroup('1@g.us', { migrate: false });
      expect(svc.getGroups()[0].migrate).toBe(false);
    });
  });

  describe('getGroups', () => {
    it('returns all groups regardless of status', () => {
      const svc = new MigrationService(filePath);
      svc.setGroups([
        makeGroup({ waGroupId: '1@g.us', status: 'pending' }),
        makeGroup({ waGroupId: '2@g.us', status: 'signal_created' }),
        makeGroup({ waGroupId: '3@g.us', status: 'notified' }),
        makeGroup({ waGroupId: '4@g.us', status: 'completed' }),
      ]);

      expect(svc.getGroups()).toHaveLength(4);
    });

    it('returns empty array for fresh state', () => {
      const svc = new MigrationService(filePath);
      expect(svc.getGroups()).toEqual([]);
    });
  });
});
