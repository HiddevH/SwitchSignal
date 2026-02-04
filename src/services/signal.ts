import axios, { AxiosInstance } from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import chalk from 'chalk';
import { humanDelay } from '../utils/delay';

const execFileAsync = promisify(execFile);

const DEFAULT_BASE_URL = 'http://localhost:8080';

export class SignalService {
  private client: AxiosInstance;
  private accountNumber: string;

  constructor(accountNumber: string, baseUrl = DEFAULT_BASE_URL) {
    this.accountNumber = accountNumber;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Verify the Signal API is reachable and the account is registered.
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const res = await this.client.get('/v1/about');
      console.log(chalk.green(`Signal API version: ${res.data.versions?.[0] || 'unknown'}`));
      return true;
    } catch {
      console.log(
        chalk.red('Cannot reach Signal API. Is the Docker container running on port 8080?')
      );
      return false;
    }
  }

  /**
   * Create a new Signal group.
   */
  async createGroup(
    name: string,
    description: string,
    members: string[] = []
  ): Promise<{ id: string; inviteLink: string }> {
    // Create the group
    const createRes = await this.client.post(`/v1/groups/${this.accountNumber}`, {
      name,
      description,
      members,
      group_link: 'enabled',
    });

    const groupId = createRes.data.id;

    // Fetch the invite link
    const groupRes = await this.client.get(
      `/v1/groups/${this.accountNumber}/${groupId}`
    );

    const inviteLink = groupRes.data.invite_link || groupRes.data.group_invite_link || '';

    return { id: groupId, inviteLink };
  }

  /**
   * Set the avatar for a Signal group.
   */
  async setGroupAvatar(groupId: string, avatarPath: string): Promise<void> {
    if (!fs.existsSync(avatarPath)) return;

    const avatar = fs.readFileSync(avatarPath).toString('base64');
    await this.client.put(`/v1/groups/${this.accountNumber}/${groupId}`, {
      avatar,
    });
  }

  /**
   * Get info about a Signal group (including member count).
   */
  async getGroupInfo(groupId: string): Promise<{
    name: string;
    memberCount: number;
    inviteLink: string;
  }> {
    const res = await this.client.get(
      `/v1/groups/${this.accountNumber}/${groupId}`
    );

    return {
      name: res.data.name,
      memberCount: res.data.members?.length || 0,
      inviteLink: res.data.invite_link || res.data.group_invite_link || '',
    };
  }

  /**
   * List all groups for the account.
   */
  async listGroups(): Promise<Array<{ id: string; name: string; memberCount: number }>> {
    const res = await this.client.get(`/v1/groups/${this.accountNumber}`);
    return (res.data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      memberCount: g.members?.length || 0,
    }));
  }

  /**
   * Check whether phone numbers are registered on Signal.
   * Tries the REST API first, falls back to docker exec signal-cli.
   */
  async getUserStatus(
    numbers: string[]
  ): Promise<Array<{ number: string; isRegistered: boolean }>> {
    // Try REST API endpoint first
    try {
      const res = await this.client.post(`/v1/accounts/${this.accountNumber}/contacts`, {
        recipients: numbers,
      });
      return (res.data || []).map((entry: any) => ({
        number: entry.number || entry.recipient,
        isRegistered: Boolean(entry.isRegistered ?? entry.registered),
      }));
    } catch {
      // REST endpoint not available, fall back to docker exec
    }

    try {
      const { stdout } = await execFileAsync('docker', [
        'exec',
        'signal-api',
        'signal-cli',
        '-a',
        this.accountNumber,
        '--output',
        'json',
        'getUserStatus',
        ...numbers,
      ]);
      const parsed = JSON.parse(stdout);
      return (Array.isArray(parsed) ? parsed : [parsed]).map((entry: any) => ({
        number: entry.number,
        isRegistered: Boolean(entry.isRegistered),
      }));
    } catch (err) {
      throw new Error(
        `Failed to check Signal registration: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Check registration status for a large list of numbers in batches.
   * Deduplicates, batches, and rate-limits automatically.
   */
  async checkRegistrationBatch(
    numbers: string[],
    batchSize = 10,
    onProgress?: (checked: number, total: number) => void
  ): Promise<Map<string, boolean>> {
    const unique = [...new Set(numbers)];
    const results = new Map<string, boolean>();
    let checked = 0;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      try {
        const statuses = await this.getUserStatus(batch);
        for (const status of statuses) {
          results.set(status.number, status.isRegistered);
        }
      } catch {
        // If a batch fails, mark all as unknown (false)
        for (const num of batch) {
          results.set(num, false);
        }
      }

      checked += batch.length;
      onProgress?.(checked, unique.length);

      if (i + batchSize < unique.length) {
        await humanDelay(2000, 4000);
      }
    }

    return results;
  }
}
