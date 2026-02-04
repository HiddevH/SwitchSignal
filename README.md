# SwitchSignal

CLI tool to migrate your WhatsApp groups to Signal. Reads your WhatsApp groups (names, descriptions, members), creates matching Signal groups with invite links, and sends personalized invitations to each member via WhatsApp.

## Prerequisites

- Node.js 20+
- Docker (for signal-cli-rest-api)
- A WhatsApp account (ideally one you're fine losing — Baileys is unofficial)
- A Signal account registered via signal-cli

## Setup

```bash
# Install dependencies
npm install

# Start the Signal API container
docker compose up -d

# Build
npm run build
```

## Usage

The migration follows a step-by-step workflow:

### 1. Initialize connections

```bash
npx switchsignal init
```

Connects to WhatsApp (QR code scan) and verifies the Signal REST API. Saves configuration to `switchsignal.config.json`.

### 2. Scan WhatsApp groups

```bash
npx switchsignal scan
```

Exports all your WhatsApp groups (names, descriptions, members, avatars) to `migration.json`.

### 3. Review and select groups

```bash
npx switchsignal review
```

Interactive prompt to choose which groups to migrate. Optionally rename groups or edit descriptions.

### 4. Create Signal groups

```bash
npx switchsignal create
```

Creates a Signal group for each selected WhatsApp group, with the same name/description, and generates invite links.

### 5. Notify members

```bash
npx switchsignal notify
```

Sends invite links to members via WhatsApp. Three strategies available:
- **Personal DMs** — one message per person with all their group invite links
- **Group announcement** — post the Signal invite link in each WhatsApp group
- **Both** — recommended

Supports Dutch and English message templates.

### 6. Check status

```bash
npx switchsignal status
```

Shows migration progress: which groups are created, notified, and how many members have joined on Signal.

## Architecture

| Component   | Technology                  | Purpose                                |
|-------------|-----------------------------|----------------------------------------|
| WhatsApp    | Baileys (WhiskeySockets)    | Read groups, send invite messages      |
| Signal      | signal-cli-rest-api (Docker)| Create groups, generate invite links   |
| CLI         | Commander.js + Inquirer.js  | Interactive command-line interface      |
| State       | Local JSON file             | Track migration progress               |
| Phone       | google-libphonenumber       | Normalize phone numbers across formats |

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── commands/
│   ├── init.ts           # Auth setup
│   ├── scan.ts           # WA group export
│   ├── review.ts         # Interactive group selection
│   ├── create.ts         # Signal group creation
│   ├── notify.ts         # Send invite links
│   └── status.ts         # Migration progress check
├── services/
│   ├── whatsapp.ts       # Baileys wrapper
│   ├── signal.ts         # signal-cli REST client
│   └── migration.ts      # State management (migration.json)
├── utils/
│   ├── phone.ts          # Phone number normalization
│   ├── templates.ts      # Message templates (NL + EN)
│   └── delay.ts          # Rate limiting helpers
└── types/
    └── index.ts          # TypeScript interfaces
```

## Important Notes

- **WhatsApp ToS**: Baileys is an unofficial API. Using it may result in account bans. Use an account you plan to leave.
- **Rate limiting**: The tool adds random delays (2-4s) between operations to appear human-like.
- **Idempotency**: Each step is resumable. Re-running a command skips already-completed work.
- **Consent**: Signal invite links are used instead of auto-adding members, respecting Signal's opt-in model.

## License

MIT
