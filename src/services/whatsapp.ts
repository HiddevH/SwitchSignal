import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  GroupMetadata,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';
import * as qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import { Member } from '../types';
import { phoneFromJid } from '../utils/phone';

const AUTH_DIR = path.resolve(process.cwd(), 'auth', 'whatsapp');

export class WhatsAppService {
  private socket: WASocket | null = null;
  private connectionReady: Promise<void> | null = null;
  private resolveConnection: (() => void) | null = null;

  /**
   * Connect to WhatsApp. Displays QR code if not previously authenticated.
   * Returns a promise that resolves when the connection is ready.
   */
  async connect(): Promise<void> {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.connectionReady = new Promise((resolve) => {
      this.resolveConnection = resolve;
    });

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(chalk.yellow('\nScan this QR code with WhatsApp:\n'));
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(chalk.yellow('Connection lost, reconnecting...'));
          this.connect();
        } else {
          console.log(chalk.red('Logged out. Please delete auth/ and run init again.'));
        }
      }

      if (connection === 'open') {
        console.log(chalk.green('Connected to WhatsApp!'));
        this.resolveConnection?.();
      }
    });

    await this.connectionReady;
  }

  /**
   * Check if we have existing auth credentials.
   */
  isAuthenticated(): boolean {
    return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
  }

  /**
   * Get all groups the user is a member of.
   */
  async getGroups(): Promise<GroupMetadata[]> {
    if (!this.socket) throw new Error('Not connected to WhatsApp');
    const groups = await this.socket.groupFetchAllParticipating();
    return Object.values(groups);
  }

  /**
   * Get metadata for a specific group.
   */
  async getGroupMetadata(groupId: string): Promise<GroupMetadata> {
    if (!this.socket) throw new Error('Not connected to WhatsApp');
    return this.socket.groupMetadata(groupId);
  }

  /**
   * Extract members from group metadata.
   */
  extractMembers(group: GroupMetadata): Member[] {
    return group.participants.map((p) => ({
      phone: phoneFromJid(p.id),
      name: p.notify || p.id.split('@')[0],
      isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
    }));
  }

  /**
   * Download group avatar/profile picture.
   */
  async downloadAvatar(groupId: string, outputPath: string): Promise<string | null> {
    if (!this.socket) throw new Error('Not connected to WhatsApp');
    try {
      const url = await this.socket.profilePictureUrl(groupId, 'image');
      if (!url) return null;

      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      return outputPath;
    } catch {
      return null;
    }
  }

  /**
   * Send a text message to a JID (user or group).
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket) throw new Error('Not connected to WhatsApp');
    await this.socket.sendMessage(jid, { text });
  }

  /**
   * Send a personal message to a phone number.
   * Phone should be in E.164 format (+31612345678).
   */
  async sendPersonalMessage(phone: string, text: string): Promise<void> {
    const jid = phone.replace('+', '') + '@s.whatsapp.net';
    await this.sendMessage(jid, text);
  }

  /**
   * Disconnect from WhatsApp.
   */
  async disconnect(): Promise<void> {
    this.socket?.end(undefined);
    this.socket = null;
  }
}
