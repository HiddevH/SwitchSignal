import chalk from 'chalk';
import * as fs from 'fs';
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

export async function readyCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Readiness Check ===\n'));

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

  const groups = migration.getGroups();
  if (groups.length === 0) {
    console.log(chalk.yellow('No groups found. Run `switchsignal scan` first.'));
    return;
  }

  // Collect all unique phone numbers
  const allNumbers = groups.flatMap((g) => g.members.map((m) => m.phone));
  const uniqueNumbers = [...new Set(allNumbers)];

  console.log(
    `Checking Signal registration for ${uniqueNumbers.length} unique contacts across ${groups.length} groups...\n`
  );

  // Batch check registrations
  const registrationMap = await signal.checkRegistrationBatch(
    uniqueNumbers,
    10,
    (checked, total) => {
      process.stdout.write(`\r  ${progressBar(checked, total)}`);
    }
  );
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const now = new Date().toISOString();

  // Update member registration status and compute readiness
  for (const group of groups) {
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
    migration.updateGroup(group.waGroupId, { readiness });
  }

  migration.save();

  // Display results grouped by readiness
  const ready: GroupInfo[] = [];
  const almost: GroupInfo[] = [];
  const notReady: GroupInfo[] = [];

  for (const group of groups) {
    const status = group.readiness?.status ?? 'not_ready';
    if (status === 'ready') ready.push(group);
    else if (status === 'almost') almost.push(group);
    else notReady.push(group);
  }

  if (ready.length > 0) {
    console.log(chalk.green.bold('✅ READY — all members on Signal:'));
    for (const g of ready) {
      const r = g.readiness!;
      console.log(
        `   ${g.name}  ${' '.repeat(Math.max(0, 30 - g.name.length))}${r.onSignal}/${r.total} members`
      );
    }
    console.log();
  }

  if (almost.length > 0) {
    console.log(chalk.yellow.bold('🟡 ALMOST — 80%+ members on Signal:'));
    for (const g of almost) {
      const r = g.readiness!;
      console.log(
        `   ${g.name}  ${' '.repeat(Math.max(0, 30 - g.name.length))}${r.onSignal}/${r.total} members (${r.missing.length} missing)`
      );
      for (let i = 0; i < r.missing.length; i++) {
        const m = r.missing[i];
        const prefix = i === r.missing.length - 1 ? '└' : '├';
        const display = m.name !== m.phone ? `${m.name} (${m.phone})` : m.phone;
        console.log(chalk.gray(`      ${prefix} ${display}`));
      }
    }
    console.log();
  }

  if (notReady.length > 0) {
    console.log(chalk.red.bold('🔴 NOT READY — many members missing:'));
    for (const g of notReady) {
      const r = g.readiness!;
      console.log(
        `   ${g.name}  ${' '.repeat(Math.max(0, 30 - g.name.length))}${r.onSignal}/${r.total} members (${r.percentage}%)`
      );
    }
    console.log();
  }

  // Summary
  console.log('─'.repeat(45));
  console.log(
    `Summary: ${chalk.green(`${ready.length} ready`)} · ${chalk.yellow(`${almost.length} almost`)} · ${chalk.red(`${notReady.length} not ready`)}`
  );

  if (ready.length > 0) {
    console.log(
      chalk.gray('Tip: Run `switchsignal create --ready` to migrate all green groups.')
    );
  }
  console.log();
}
