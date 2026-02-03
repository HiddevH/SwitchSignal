import axios from 'axios';
import { SignalService } from '../../src/services/signal';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs for setGroupAvatar tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
import * as fs from 'fs';
const mockedFs = fs as jest.Mocked<typeof fs>;

// Suppress chalk/console output in tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SignalService', () => {
  let mockClient: {
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
  };
  let service: SignalService;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockClient as any);
    service = new SignalService('+31612345678', 'http://localhost:8080');
  });

  describe('constructor', () => {
    it('creates an axios client with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8080',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('uses default base URL when not specified', () => {
      mockedAxios.create.mockClear();
      new SignalService('+31612345678');
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://localhost:8080' })
      );
    });
  });

  describe('verifyConnection', () => {
    it('returns true when API responds', async () => {
      mockClient.get.mockResolvedValue({ data: { versions: ['0.12.0'] } });
      const result = await service.verifyConnection();
      expect(result).toBe(true);
      expect(mockClient.get).toHaveBeenCalledWith('/v1/about');
    });

    it('returns false when API is unreachable', async () => {
      mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await service.verifyConnection();
      expect(result).toBe(false);
    });

    it('handles response without versions field', async () => {
      mockClient.get.mockResolvedValue({ data: {} });
      const result = await service.verifyConnection();
      expect(result).toBe(true);
    });
  });

  describe('createGroup', () => {
    it('creates a group and returns id + invite link', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 'group-abc' } });
      mockClient.get.mockResolvedValue({
        data: { invite_link: 'https://signal.group/#xyz' },
      });

      const result = await service.createGroup('Family', 'My family group');

      expect(mockClient.post).toHaveBeenCalledWith('/v1/groups/+31612345678', {
        name: 'Family',
        description: 'My family group',
        members: [],
        group_link: 'enabled',
      });
      expect(mockClient.get).toHaveBeenCalledWith('/v1/groups/+31612345678/group-abc');
      expect(result).toEqual({ id: 'group-abc', inviteLink: 'https://signal.group/#xyz' });
    });

    it('passes members when provided', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 'group-def' } });
      mockClient.get.mockResolvedValue({ data: {} });

      await service.createGroup('Test', 'Desc', ['+31600000001', '+31600000002']);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/v1/groups/+31612345678',
        expect.objectContaining({
          members: ['+31600000001', '+31600000002'],
        })
      );
    });

    it('handles group_invite_link field name variant', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 'group-ghi' } });
      mockClient.get.mockResolvedValue({
        data: { group_invite_link: 'https://signal.group/#alt' },
      });

      const result = await service.createGroup('Alt', 'Desc');
      expect(result.inviteLink).toBe('https://signal.group/#alt');
    });

    it('returns empty string when no invite link in response', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 'group-jkl' } });
      mockClient.get.mockResolvedValue({ data: {} });

      const result = await service.createGroup('No Link', 'Desc');
      expect(result.inviteLink).toBe('');
    });

    it('throws when API call fails', async () => {
      mockClient.post.mockRejectedValue(new Error('API error'));
      await expect(service.createGroup('Fail', 'Desc')).rejects.toThrow('API error');
    });
  });

  describe('setGroupAvatar', () => {
    it('uploads base64-encoded avatar', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));
      mockClient.put.mockResolvedValue({});

      await service.setGroupAvatar('group-123', '/path/to/avatar.jpg');

      expect(mockClient.put).toHaveBeenCalledWith('/v1/groups/+31612345678/group-123', {
        avatar: Buffer.from('fake-image-data').toString('base64'),
      });
    });

    it('does nothing when avatar file does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      await service.setGroupAvatar('group-123', '/nonexistent.jpg');

      expect(mockClient.put).not.toHaveBeenCalled();
    });
  });

  describe('getGroupInfo', () => {
    it('returns group name, member count, and invite link', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          name: 'My Group',
          members: [{}, {}, {}],
          invite_link: 'https://signal.group/#link',
        },
      });

      const info = await service.getGroupInfo('group-xyz');

      expect(info).toEqual({
        name: 'My Group',
        memberCount: 3,
        inviteLink: 'https://signal.group/#link',
      });
      expect(mockClient.get).toHaveBeenCalledWith('/v1/groups/+31612345678/group-xyz');
    });

    it('returns 0 members when members field is missing', async () => {
      mockClient.get.mockResolvedValue({
        data: { name: 'Empty', invite_link: '' },
      });

      const info = await service.getGroupInfo('group-empty');
      expect(info.memberCount).toBe(0);
    });

    it('throws when API call fails', async () => {
      mockClient.get.mockRejectedValue(new Error('Not found'));
      await expect(service.getGroupInfo('bad-id')).rejects.toThrow('Not found');
    });
  });

  describe('listGroups', () => {
    it('returns formatted list of groups', async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 'g1', name: 'Group 1', members: [{}, {}] },
          { id: 'g2', name: 'Group 2', members: [{}] },
        ],
      });

      const groups = await service.listGroups();

      expect(groups).toEqual([
        { id: 'g1', name: 'Group 1', memberCount: 2 },
        { id: 'g2', name: 'Group 2', memberCount: 1 },
      ]);
      expect(mockClient.get).toHaveBeenCalledWith('/v1/groups/+31612345678');
    });

    it('returns empty array when no groups', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      const groups = await service.listGroups();
      expect(groups).toEqual([]);
    });

    it('handles null response data', async () => {
      mockClient.get.mockResolvedValue({ data: null });
      const groups = await service.listGroups();
      expect(groups).toEqual([]);
    });

    it('handles groups without members array', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ id: 'g1', name: 'No Members' }],
      });

      const groups = await service.listGroups();
      expect(groups[0].memberCount).toBe(0);
    });
  });
});
