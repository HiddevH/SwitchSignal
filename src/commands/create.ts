import chalk from 'chalk';
import * as fs from 'fs';
import { SignalService } from '../services/signal';
import { MigrationService } from '../services/migration';
import { humanDelay, withRetry } from '../utils/delay';

function loadConfig(): { signalNumber: string; signalApiUrl: string } | null {
  try {
    const raw = fs.readFileSync('switchsignal.config.json', 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Create Signal Groups ===\n'));

  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('No config found. Run `switchsignal init` first.'));
    return;
  }

  const migration = new MigrationService();
  if (!migration.exists()) {
    console.log(chalk.red('No migration.json found. Run `switchsignal scan` first.'));
    return;
  }

  const signal = new SignalService(config.signalNumber, config.signalApiUrl);
  const ok = await signal.verifyConnection();
  if (!ok) return;

  const pending = migration.getGroupsPendingCreation();

  if (pending.length === 0) {
    console.log(chalk.yellow('No groups pending creation. Nothing to do.'));
    return;
  }

  console.log(`Creating ${pending.length} Signal groups...\n`);

  let created = 0;
  let failed = 0;

  for (const group of pending) {
    process.stdout.write(`  Creating "${group.name}"... `);

    try {
      const result = await withRetry(
        () => signal.createGroup(group.name, group.description),
        2,
        3000
      );

      migration.updateGroup(group.waGroupId, {
        signalGroupId: result.id,
        signalInviteLink: result.inviteLink,
        status: 'signal_created',
      });
      migration.save();

      console.log(chalk.green('✓'));

      if (result.inviteLink) {
        console.log(chalk.gray(`    Invite: ${result.inviteLink}`));
      }

      // Set avatar if available
      if (group.avatarPath && fs.existsSync(group.avatarPath)) {
        try {
          await signal.setGroupAvatar(result.id, group.avatarPath);
          console.log(chalk.gray('    Avatar set'));
        } catch {
          console.log(chalk.gray('    Avatar failed (non-critical)'));
        }
      }

      created++;
    } catch (err) {
      console.log(chalk.red('✗'));
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`    Error: ${message}`));
      failed++;
    }

    // Rate limit
    await humanDelay();
  }

  console.log(
    chalk.bold.green(`\n✓ Created: ${created}`) +
      (failed > 0 ? chalk.bold.red(` | Failed: ${failed}`) : '')
  );
  console.log(chalk.gray('Run `switchsignal notify` to send invite links.\n'));
}
