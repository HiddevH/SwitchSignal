import * as fs from 'fs';
import * as path from 'path';
import { MigrationState, GroupInfo } from '../types';

const DEFAULT_PATH = path.resolve(process.cwd(), 'migration.json');

export class MigrationService {
  private filePath: string;
  private state: MigrationState;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    this.state = this.load();
  }

  /**
   * Load migration state from disk, or return empty state.
   */
  private load(): MigrationState {
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as MigrationState;
    }
    return { scannedAt: '', groups: [] };
  }

  /**
   * Save current state to disk.
   */
  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /**
   * Get the full migration state.
   */
  getState(): MigrationState {
    return this.state;
  }

  /**
   * Get all groups.
   */
  getGroups(): GroupInfo[] {
    return this.state.groups;
  }

  /**
   * Get groups marked for migration.
   */
  getGroupsToMigrate(): GroupInfo[] {
    return this.state.groups.filter((g) => g.migrate);
  }

  /**
   * Get groups that need Signal group creation.
   */
  getGroupsPendingCreation(): GroupInfo[] {
    return this.state.groups.filter((g) => g.migrate && g.status === 'pending');
  }

  /**
   * Get groups that have been created on Signal but not yet notified.
   */
  getGroupsPendingNotification(): GroupInfo[] {
    return this.state.groups.filter((g) => g.migrate && g.status === 'signal_created');
  }

  /**
   * Set the scanned groups, replacing any previous scan.
   */
  setGroups(groups: GroupInfo[]): void {
    this.state.scannedAt = new Date().toISOString();
    this.state.groups = groups;
  }

  /**
   * Update a specific group by its WhatsApp group ID.
   */
  updateGroup(waGroupId: string, updates: Partial<GroupInfo>): void {
    const idx = this.state.groups.findIndex((g) => g.waGroupId === waGroupId);
    if (idx === -1) throw new Error(`Group not found: ${waGroupId}`);
    this.state.groups[idx] = { ...this.state.groups[idx], ...updates };
  }

  /**
   * Check if a migration file exists.
   */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }
}
