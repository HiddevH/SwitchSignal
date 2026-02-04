#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { scanCommand } from './commands/scan';
import { reviewCommand } from './commands/review';
import { createCommand } from './commands/create';
import { notifyCommand } from './commands/notify';
import { statusCommand } from './commands/status';
import { readyCommand } from './commands/ready';

const program = new Command();

program
  .name('switchsignal')
  .description('Migrate your WhatsApp groups to Signal')
  .version('1.0.0');

program
  .command('init')
  .description('Connect to WhatsApp and Signal APIs')
  .action(async () => {
    try {
      await initCommand();
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('scan')
  .description('Scan and export WhatsApp groups to migration.json')
  .action(async () => {
    try {
      await scanCommand();
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('review')
  .description('Review and select which groups to migrate')
  .action(async () => {
    try {
      await reviewCommand();
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('ready')
  .description('Check which groups are ready to migrate (members on Signal)')
  .action(async () => {
    try {
      await readyCommand();
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('create')
  .description('Create Signal groups for selected WhatsApp groups')
  .option('--ready', 'Only create groups where all members are on Signal')
  .action(async (opts) => {
    try {
      await createCommand({ ready: opts.ready });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('notify')
  .description('Send Signal invite links to WhatsApp members')
  .option('--nudge', 'Send nudge messages to members not yet on Signal')
  .action(async (opts) => {
    try {
      await notifyCommand({ nudge: opts.nudge });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check migration progress across all groups')
  .action(async () => {
    try {
      await statusCommand();
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
