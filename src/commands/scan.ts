import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppService } from '../services/whatsapp';
import { SignalService } from '../services/signal';
import { MigrationService } from '../services/migration';
import { GroupInfo, GroupReadiness, ReadinessStatus } from '../types';

const ALMOST_THRESHOLD = 0.8;

function loadConfig(): { signalNumber: string; signalApiUrl: string } | null {
  try {
    const raw = fs.readFileSync('switchsignal.config.json', 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getReadinessStatus(percentage: number): ReadinessStatus {
  if (percentage >= 100) return 'ready';
  if (percentage >= ALMOST_THRESHOLD * 100) return 'almost';
  return 'not_ready';
}

function progressBar(checked: number, total: number): string {
  const width = 24;
  const filled = Math.round((checked / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${checked}/${total}`;
}

function readinessIcon(status: ReadinessStatus): string {
  if (status === 'ready') return chalk.green('✓');
  if (status === 'almost') return chalk.yellow('~');
  return chalk.red('✗');
}

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

  // Check Signal compatibility if config is available
  const config = loadConfig();
  if (config && groupInfos.length > 0) {
    console.log(chalk.bold('\n--- Signal Compatibility Check ---\n'));

    const signal = new SignalService(config.signalNumber, config.signalApiUrl);
    const connected = await signal.verifyConnection();

    if (connected) {
      const allNumbers = groupInfos.flatMap((g) => g.members.map((m) => m.phone));
      const uniqueNumbers = [...new Set(allNumbers)];

      console.log(
        `Checking ${uniqueNumbers.length} unique contacts across ${groupInfos.length} groups...\n`
      );

      const registrationMap = await signal.checkRegistrationBatch(
        uniqueNumbers,
        10,
        (checked, total) => {
          process.stdout.write(`\r  ${progressBar(checked, total)}`);
        }
      );
      process.stdout.write('\r' + ' '.repeat(60) + '\r');

      const now = new Date().toISOString();

      for (const group of groupInfos) {
        for (const member of group.members) {
          const registered = registrationMap.get(member.phone);
          member.signalRegistered = registered ?? false;
          member.signalCheckedAt = now;
        }

        const onSignal = group.members.filter((m) => m.signalRegistered).length;
        const total = group.members.length;
        const percentage = total > 0 ? Math.round((onSignal / total) * 100) : 0;
        const missing = group.members
          .filter((m) => !m.signalRegistered)
          .map((m) => ({ phone: m.phone, name: m.name }));

        const readiness: GroupReadiness = {
          total,
          onSignal,
          missing,
          percentage,
          status: getReadinessStatus(percentage),
          checkedAt: now,
        };

        group.readiness = readiness;
        migration.updateGroup(group.waGroupId, { readiness, members: group.members });
      }

      migration.save();

      // Display per-group Signal compatibility overview
      console.log(chalk.bold('Signal compatibility per group:\n'));

      // Sort: ready first, then almost, then not_ready
      const sorted = [...groupInfos].sort((a, b) => {
        const order: Record<ReadinessStatus, number> = { ready: 0, almost: 1, not_ready: 2 };
        const sa = a.readiness?.status ?? 'not_ready';
        const sb = b.readiness?.status ?? 'not_ready';
        return order[sa] - order[sb];
      });

      for (const group of sorted) {
        const r = group.readiness!;
        const icon = readinessIcon(r.status);
        const pct = `${r.percentage}%`;
        const padding = ' '.repeat(Math.max(0, 30 - group.name.length));
        console.log(`  ${icon} ${group.name}${padding} ${r.onSignal}/${r.total} on Signal (${pct})`);
      }

      // Summary counts
      const readyCount = groupInfos.filter((g) => g.readiness?.status === 'ready').length;
      const almostCount = groupInfos.filter((g) => g.readiness?.status === 'almost').length;
      const notReadyCount = groupInfos.filter((g) => g.readiness?.status === 'not_ready').length;

      console.log('\n' + '─'.repeat(45));
      console.log(
        `  ${chalk.green(`${readyCount} ready`)} · ${chalk.yellow(`${almostCount} almost`)} · ${chalk.red(`${notReadyCount} not ready`)}`
      );

      if (readyCount > 0) {
        console.log(
          chalk.gray('\n  Groups marked "ready" can switch to Signal without anyone missing.')
        );
      }
    } else {
      console.log(
        chalk.gray('Signal API not available. Run `switchsignal ready` later to check compatibility.')
      );
    }
  }

  console.log(chalk.gray('\nRun `switchsignal review` to select which groups to migrate.\n'));

  await wa.disconnect();
}
