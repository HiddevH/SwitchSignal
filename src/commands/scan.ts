import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppService } from '../services/whatsapp';
import { MigrationService } from '../services/migration';
import { GroupInfo } from '../types';

export async function scanCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Scan WhatsApp Groups ===\n'));

  const wa = new WhatsAppService();

  if (!wa.isAuthenticated()) {
    console.log(chalk.red('Not authenticated. Run `switchsignal init` first.'));
    return;
  }

  console.log('Connecting to WhatsApp...');
  await wa.connect();

  console.log('Fetching groups...\n');
  const groups = await wa.getGroups();

  console.log(chalk.green(`Found ${groups.length} groups.\n`));

  const avatarDir = path.resolve(process.cwd(), 'auth', 'avatars');
  fs.mkdirSync(avatarDir, { recursive: true });

  const groupInfos: GroupInfo[] = [];

  for (const group of groups) {
    const members = wa.extractMembers(group);

    // Try to download avatar
    const avatarPath = path.join(avatarDir, `${group.id.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`);
    const savedAvatar = await wa.downloadAvatar(group.id, avatarPath);

    const info: GroupInfo = {
      waGroupId: group.id,
      name: group.subject || 'Unnamed Group',
      description: group.desc || '',
      memberCount: members.length,
      members,
      avatarPath: savedAvatar,
      migrate: true,
      signalGroupId: null,
      signalInviteLink: null,
      status: 'pending',
    };

    groupInfos.push(info);

    console.log(
      `  ${chalk.cyan(info.name)} — ${info.memberCount} members` +
        (savedAvatar ? chalk.gray(' (avatar saved)') : '')
    );
  }

  const migration = new MigrationService();
  migration.setGroups(groupInfos);
  migration.save();

  console.log(chalk.bold.green(`\n✓ Saved ${groupInfos.length} groups to migration.json`));
  console.log(chalk.gray('Run `switchsignal review` to select which groups to migrate.\n'));

  await wa.disconnect();
}
