import chalk from 'chalk';
import inquirer from 'inquirer';
import { MigrationService } from '../services/migration';
import { GroupInfo } from '../types';

function readinessLabel(group: GroupInfo): string {
  const r = group.readiness;
  if (!r) return '';
  if (r.status === 'ready') return chalk.green(` — ${r.onSignal}/${r.total} on Signal ✓`);
  if (r.status === 'almost') return chalk.yellow(` — ${r.onSignal}/${r.total} on Signal`);
  return chalk.red(` — ${r.onSignal}/${r.total} on Signal`);
}

export async function reviewCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Review Groups ===\n'));

  const migration = new MigrationService();

  if (!migration.exists()) {
    console.log(chalk.red('No migration.json found. Run `switchsignal scan` first.'));
    return;
  }

  const groups = migration.getGroups();

  if (groups.length === 0) {
    console.log(chalk.yellow('No groups found in migration.json.'));
    return;
  }

  const hasReadiness = groups.some((g) => g.readiness);

  console.log(`Found ${groups.length} scanned groups.\n`);

  if (hasReadiness) {
    console.log(chalk.gray('Signal compatibility is shown per group. Groups where all members'));
    console.log(chalk.gray('are on Signal can switch without anyone missing.\n'));
  }

  // Select which groups to migrate
  const { selectedGroups } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedGroups',
      message: 'Select groups to migrate to Signal:',
      choices: groups.map((g) => ({
        name: `${g.name} (${g.memberCount} members)${readinessLabel(g)}${g.status !== 'pending' ? ` [${g.status}]` : ''}`,
        value: g.waGroupId,
        checked: g.migrate,
      })),
    },
  ]);

  // Update migrate flags
  for (const group of groups) {
    migration.updateGroup(group.waGroupId, {
      migrate: selectedGroups.includes(group.waGroupId),
    });
  }

  // Allow renaming groups
  const toMigrate = groups.filter((g) => selectedGroups.includes(g.waGroupId));

  if (toMigrate.length > 0) {
    const { wantRename } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantRename',
        message: 'Do you want to rename any groups for Signal?',
        default: false,
      },
    ]);

    if (wantRename) {
      for (const group of toMigrate) {
        const { newName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newName',
            message: `Name for "${group.name}":`,
            default: group.name,
          },
        ]);

        const { newDesc } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newDesc',
            message: `Description for "${newName}":`,
            default: group.description,
          },
        ]);

        migration.updateGroup(group.waGroupId, {
          name: newName,
          description: newDesc,
        });
      }
    }
  }

  migration.save();

  const migrateCount = selectedGroups.length;
  console.log(
    chalk.bold.green(`\n✓ ${migrateCount} groups selected for migration.`)
  );
  console.log(chalk.gray('Run `switchsignal create` to create Signal groups.\n'));
}
