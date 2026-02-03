import chalk from 'chalk';
import * as fs from 'fs';
import { SignalService } from '../services/signal';
import { MigrationService } from '../services/migration';

function loadConfig(): { signalNumber: string; signalApiUrl: string } | null {
  try {
    const raw = fs.readFileSync('switchsignal.config.json', 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function statusCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Migration Status ===\n'));

  const migration = new MigrationService();
  if (!migration.exists()) {
    console.log(chalk.red('No migration.json found. Run `switchsignal scan` first.'));
    return;
  }

  const groups = migration.getGroups();
  const config = loadConfig();

  let signal: SignalService | null = null;
  if (config) {
    signal = new SignalService(config.signalNumber, config.signalApiUrl);
    const ok = await signal.verifyConnection();
    if (!ok) signal = null;
  }

  console.log(`Total groups scanned: ${groups.length}\n`);

  const statusCounts = { pending: 0, signal_created: 0, notified: 0, completed: 0, skipped: 0 };

  for (const group of groups) {
    if (!group.migrate) {
      statusCounts.skipped++;
      console.log(`  ${chalk.gray('—')} ${chalk.gray(group.name)} ${chalk.gray('(skipped)')}`);
      continue;
    }

    let signalMembers = '?';

    // Try to fetch Signal group member count
    if (signal && group.signalGroupId) {
      try {
        const info = await signal.getGroupInfo(group.signalGroupId);
        signalMembers = String(info.memberCount);

        // Auto-mark as completed if Signal members >= WA members
        if (info.memberCount >= group.memberCount && group.status === 'notified') {
          migration.updateGroup(group.waGroupId, { status: 'completed' });
          group.status = 'completed';
        }
      } catch {
        // Signal API unavailable, just show unknown
      }
    }

    statusCounts[group.status]++;

    const statusIcon =
      group.status === 'completed'
        ? chalk.green('✓')
        : group.status === 'notified'
          ? chalk.yellow('◐')
          : group.status === 'signal_created'
            ? chalk.blue('○')
            : chalk.gray('·');

    const memberInfo =
      group.signalGroupId
        ? `${signalMembers}/${group.memberCount} members on Signal`
        : `${group.memberCount} WA members`;

    console.log(`  ${statusIcon} ${group.name} — ${memberInfo} [${group.status}]`);

    if (group.signalInviteLink) {
      console.log(chalk.gray(`      ${group.signalInviteLink}`));
    }
  }

  migration.save();

  console.log(chalk.bold('\n--- Summary ---'));
  console.log(`  Pending:         ${statusCounts.pending}`);
  console.log(`  Signal created:  ${statusCounts.signal_created}`);
  console.log(`  Notified:        ${statusCounts.notified}`);
  console.log(`  Completed:       ${chalk.green(String(statusCounts.completed))}`);
  console.log(`  Skipped:         ${chalk.gray(String(statusCounts.skipped))}`);
  console.log();
}
