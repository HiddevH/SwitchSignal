import chalk from 'chalk';
import inquirer from 'inquirer';
import { WhatsAppService } from '../services/whatsapp';
import { MigrationService } from '../services/migration';
import { getTemplates } from '../utils/templates';
import { humanDelay } from '../utils/delay';
import { GroupInvite, Language, NotifyStrategy } from '../types';

export async function notifyCommand(options: { nudge?: boolean } = {}): Promise<void> {
  if (options.nudge) {
    await nudgeCommand();
    return;
  }

  console.log(chalk.bold('\n=== SwitchSignal — Notify Members ===\n'));

  const migration = new MigrationService();
  if (!migration.exists()) {
    console.log(chalk.red('No migration.json found. Run `switchsignal scan` first.'));
    return;
  }

  const readyGroups = migration.getGroupsPendingNotification();

  if (readyGroups.length === 0) {
    console.log(chalk.yellow('No groups ready for notification.'));
    console.log(chalk.gray('Run `switchsignal create` first to create Signal groups.'));
    return;
  }

  console.log(`${readyGroups.length} groups ready to notify.\n`);

  const { language } = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Message language:',
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Dutch (Nederlands)', value: 'nl' },
      ],
    },
  ]);

  const { strategy } = await inquirer.prompt([
    {
      type: 'list',
      name: 'strategy',
      message: 'Notification strategy:',
      choices: [
        { name: 'Personal DMs to each member (recommended)', value: 'personal' },
        { name: 'Message in each WhatsApp group', value: 'group' },
        { name: 'Both personal DMs and group messages', value: 'both' },
      ],
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `This will send WhatsApp messages. Continue?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.red('Aborted.'));
    return;
  }

  const wa = new WhatsAppService();
  console.log('\nConnecting to WhatsApp...');
  await wa.connect();

  const templates = getTemplates(language as Language);
  const strat = strategy as NotifyStrategy;

  // Strategy A: Personal DMs
  if (strat === 'personal' || strat === 'both') {
    console.log(chalk.blue('\n--- Sending personal messages ---\n'));

    // Build per-member group lists
    const memberGroups = new Map<string, { name: string; groups: GroupInvite[] }>();

    for (const group of readyGroups) {
      if (!group.signalInviteLink) continue;

      for (const member of group.members) {
        if (!memberGroups.has(member.phone)) {
          memberGroups.set(member.phone, { name: member.name, groups: [] });
        }
        memberGroups.get(member.phone)!.groups.push({
          name: group.name,
          inviteLink: group.signalInviteLink,
        });
      }
    }

    let sent = 0;
    const total = memberGroups.size;

    for (const [phone, data] of memberGroups) {
      const message = templates.personal(data.name, data.groups);
      try {
        await wa.sendPersonalMessage(phone, message);
        sent++;
        console.log(`  ${chalk.green('✓')} ${data.name} (${phone}) [${sent}/${total}]`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${chalk.red('✗')} ${data.name} (${phone}): ${msg}`);
      }

      await humanDelay();
    }
  }

  // Strategy B: Group announcements
  if (strat === 'group' || strat === 'both') {
    console.log(chalk.blue('\n--- Sending group announcements ---\n'));

    for (const group of readyGroups) {
      if (!group.signalInviteLink) continue;

      const message = templates.group(group.signalInviteLink);
      try {
        await wa.sendMessage(group.waGroupId, message);
        console.log(`  ${chalk.green('✓')} ${group.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${chalk.red('✗')} ${group.name}: ${msg}`);
      }

      await humanDelay();
    }
  }

  // Mark groups as notified
  for (const group of readyGroups) {
    migration.updateGroup(group.waGroupId, { status: 'notified' });
  }
  migration.save();

  console.log(chalk.bold.green('\n✓ Notifications sent!'));
  console.log(chalk.gray('Run `switchsignal status` to check migration progress.\n'));

  await wa.disconnect();
}

async function nudgeCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Nudge Missing Members ===\n'));

  const migration = new MigrationService();
  if (!migration.exists()) {
    console.log(chalk.red('No migration.json found. Run `switchsignal scan` first.'));
    return;
  }

  // Find "almost" groups that have readiness data
  const groups = migration.getGroups().filter(
    (g) => g.migrate && g.readiness?.status === 'almost' && g.readiness.missing.length > 0
  );

  if (groups.length === 0) {
    console.log(chalk.yellow('No "almost ready" groups with missing members found.'));
    console.log(chalk.gray('Run `switchsignal ready` first to check readiness.'));
    return;
  }

  console.log(`${groups.length} groups with missing members.\n`);

  for (const g of groups) {
    const missing = g.readiness!.missing;
    console.log(`  ${g.name}: ${missing.length} missing`);
    for (const m of missing) {
      const display = m.name !== m.phone ? `${m.name} (${m.phone})` : m.phone;
      console.log(chalk.gray(`    - ${display}`));
    }
  }

  const { language } = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Message language:',
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Dutch (Nederlands)', value: 'nl' },
      ],
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Send nudge messages to missing members via WhatsApp?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.red('Aborted.'));
    return;
  }

  const wa = new WhatsAppService();
  console.log('\nConnecting to WhatsApp...');
  await wa.connect();

  const templates = getTemplates(language as Language);

  // Deduplicate: one nudge per person with all their group names
  const memberNudges = new Map<string, { name: string; groupNames: string[] }>();

  for (const group of groups) {
    for (const missing of group.readiness!.missing) {
      if (!memberNudges.has(missing.phone)) {
        memberNudges.set(missing.phone, { name: missing.name, groupNames: [] });
      }
      memberNudges.get(missing.phone)!.groupNames.push(group.name);
    }
  }

  let sent = 0;
  const total = memberNudges.size;

  for (const [phone, data] of memberNudges) {
    const message = templates.nudge(data.name, data.groupNames);
    try {
      await wa.sendPersonalMessage(phone, message);
      sent++;
      console.log(`  ${chalk.green('✓')} ${data.name} (${phone}) [${sent}/${total}]`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${chalk.red('✗')} ${data.name} (${phone}): ${msg}`);
    }

    await humanDelay();
  }

  console.log(chalk.bold.green(`\n✓ Nudge messages sent to ${sent} members!`));
  await wa.disconnect();
}
