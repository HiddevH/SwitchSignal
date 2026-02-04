import chalk from 'chalk';
import inquirer from 'inquirer';
import { WhatsAppService } from '../services/whatsapp';
import { SignalService } from '../services/signal';
import { regionFromPhone } from '../utils/phone';

export async function initCommand(): Promise<void> {
  console.log(chalk.bold('\n=== SwitchSignal — Initialize ===\n'));

  console.log(chalk.yellow('⚠️  Warning: This tool uses an unofficial WhatsApp API (Baileys).'));
  console.log(chalk.yellow('   Using it may violate WhatsApp Terms of Service and could'));
  console.log(chalk.yellow('   result in your account being banned.'));
  console.log(chalk.yellow('   Recommended: use an account you plan to leave anyway.\n'));

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Do you understand the risks and want to continue?',
      default: false,
    },
  ]);

  if (!proceed) {
    console.log(chalk.red('Aborted.'));
    return;
  }

  // Step 1: Connect to WhatsApp
  console.log(chalk.blue('\n--- Step 1: Connect to WhatsApp ---\n'));

  const wa = new WhatsAppService();

  if (wa.isAuthenticated()) {
    console.log(chalk.green('Existing WhatsApp session found. Reconnecting...'));
  } else {
    console.log('Opening WhatsApp connection. Scan the QR code with your phone.');
  }

  await wa.connect();
  console.log(chalk.green('WhatsApp: Ready!\n'));

  // Step 2: Connect to Signal
  console.log(chalk.blue('--- Step 2: Connect to Signal API ---\n'));

  const { signalNumber } = await inquirer.prompt([
    {
      type: 'input',
      name: 'signalNumber',
      message: 'Enter your Signal phone number (E.164 format, e.g. +14155551234):',
      validate: (input: string) => {
        if (/^\+\d{7,15}$/.test(input)) return true;
        return 'Please enter a valid phone number in E.164 format (e.g. +14155551234)';
      },
    },
  ]);

  const { signalApiUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'signalApiUrl',
      message: 'Signal API URL:',
      default: 'http://localhost:8080',
    },
  ]);

  const signal = new SignalService(signalNumber, signalApiUrl);
  const signalOk = await signal.verifyConnection();

  if (!signalOk) {
    console.log(chalk.red('\nCould not connect to Signal API.'));
    console.log(chalk.yellow('Make sure the Docker container is running:'));
    console.log(chalk.gray('  docker compose up -d'));
    await wa.disconnect();
    return;
  }

  console.log(chalk.green('Signal API: Ready!\n'));

  // Auto-detect region from Signal phone number
  const detectedRegion = regionFromPhone(signalNumber);
  if (detectedRegion) {
    console.log(chalk.gray(`Detected region: ${detectedRegion} (from your Signal number)`));
  }

  // Save config
  const config = {
    signalNumber,
    signalApiUrl,
    ...(detectedRegion ? { region: detectedRegion } : {}),
  };
  const fs = await import('fs');
  fs.writeFileSync('switchsignal.config.json', JSON.stringify(config, null, 2));
  console.log(chalk.green('Configuration saved to switchsignal.config.json'));

  console.log(chalk.bold.green('\n✓ Initialization complete! Run `switchsignal scan` next.\n'));

  await wa.disconnect();
}
