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

  // Check if API is reachable
  const reachable = await signal.isReachable();
  if (!reachable) {
    console.log(chalk.red('\nCannot reach Signal API.'));
    console.log(chalk.yellow('Make sure the Docker container is running:'));
    console.log(chalk.gray('  docker compose up -d'));
    await wa.disconnect();
    return;
  }
  console.log(chalk.green('Signal API is reachable.'));

  // Check if account is already registered
  let accounts: string[] = [];
  try {
    accounts = await signal.getAccounts();
  } catch {
    // endpoint may not be available
  }

  if (!accounts.includes(signalNumber)) {
    console.log(chalk.yellow(`\nAccount ${signalNumber} is not yet registered in the Signal API.`));
    console.log(chalk.yellow('You need to link or register your Signal account.\n'));

    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'How do you want to connect your Signal account?',
        choices: [
          { name: 'Link as secondary device (scan QR code in Signal app — recommended)', value: 'link' },
          { name: 'Register with SMS verification code', value: 'register' },
        ],
      },
    ]);

    if (method === 'link') {
      console.log(chalk.blue('\nGenerating QR code for linking...'));
      console.log(chalk.gray('Open Signal on your phone → Settings → Linked Devices → Link New Device\n'));

      try {
        const qrUri = await signal.getLinkQrUri();
        const qrcode = await import('qrcode-terminal');
        qrcode.generate(qrUri, { small: true });
        console.log(chalk.yellow('\nScan the QR code above with your Signal app.'));
        console.log('Waiting for confirmation...\n');

        // Poll for the account to appear
        let linked = false;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const updated = await signal.getAccounts();
            if (updated.includes(signalNumber)) {
              linked = true;
              break;
            }
          } catch {
            // keep polling
          }
        }

        if (!linked) {
          console.log(chalk.red('Linking timed out. Try again with `switchsignal init`.'));
          await wa.disconnect();
          return;
        }
        console.log(chalk.green('Signal account linked!\n'));
      } catch (err: any) {
        console.log(chalk.red(`Linking failed: ${err?.message || 'unknown error'}`));
        console.log(chalk.yellow('You may need to register via SMS instead, or check your Signal API version.'));
        await wa.disconnect();
        return;
      }
    } else {
      // SMS registration
      console.log(chalk.blue('\nSending SMS verification code...'));
      try {
        await signal.register();
        console.log(chalk.green('Verification code sent.\n'));
      } catch (err: any) {
        console.log(chalk.red(`Failed to send code: ${err?.message || 'unknown error'}`));
        await wa.disconnect();
        return;
      }

      const { verifyCode } = await inquirer.prompt([
        {
          type: 'input',
          name: 'verifyCode',
          message: 'Enter the verification code from SMS (digits only):',
          validate: (input: string) => {
            if (/^\d{3,8}$/.test(input.replace(/-/g, ''))) return true;
            return 'Enter the numeric code you received via SMS';
          },
        },
      ]);

      try {
        await signal.verifyRegistration(verifyCode.replace(/-/g, ''));
        console.log(chalk.green('Account verified!\n'));
      } catch (err: any) {
        console.log(chalk.red(`Verification failed: ${err?.message || 'unknown error'}`));
        await wa.disconnect();
        return;
      }
    }
  }

  // Now run the full verification
  const signalOk = await signal.verifyConnection();
  if (!signalOk) {
    console.log(chalk.red('\nSignal API verification failed after setup.'));
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
