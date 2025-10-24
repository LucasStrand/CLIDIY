# Teams CLI

A simple CLI to chat in Microsoft Teams via Microsoft Graph.

## Prerequisites

- Node.js 18+
- An Azure AD app registration (Public client/native) with Redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`
- In Azure Portal → App registrations → your app → Authentication → Advanced settings, enable "Allow public client flows".
- Required delegated permissions granted and consented:
  - User.Read
  - offline_access
  - Chat.ReadWrite
  - Chat.Create
  - Team.ReadBasic.All
  - Channel.ReadBasic.All
  - ChannelMessage.Send
  - User.ReadBasic.All (for listing/searching users in CLI)

## Setup

1. Install deps:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Configure your Azure app:

```bash
# Either set env vars (preferred for CI)
set TEAMSCLI_CLIENT_ID=YOUR_CLIENT_ID
set TEAMSCLI_TENANT_ID=organizations  # or your tenant ID

# Or persist in config
node dist/cli/index.js config --set clientId=YOUR_CLIENT_ID tenantId=organizations
```

## Usage

Show help:

```bash
node dist/cli/index.js --help
```

Login:

```bash
node dist/cli/index.js login
```

If you see invalid_client:

- Ensure "Allow public client flows" is enabled on the app registration.
- Confirm `TEAMSCLI_CLIENT_ID` and `TEAMSCLI_TENANT_ID` are correct.

Current user:

```bash
node dist/cli/index.js me
```

List teams:

```bash
node dist/cli/index.js teams
```

List channels for a team:

```bash
node dist/cli/index.js channels --team TEAM_ID
```

List chats:

```bash
node dist/cli/index.js chats
```

Search users:

```bash
node dist/cli/index.js users -q "Ada"
```

Send to channel:

```bash
node dist/cli/index.js send:channel --team TEAM_ID --channel CHANNEL_ID --message "Hello from CLI"
```

Send 1:1 chat by user principal name:

```bash
node dist/cli/index.js send:chat --user user@contoso.com --message "Ping"
```

Or to an existing chat by ID:

```bash
node dist/cli/index.js send:chat --chat-id CHAT_ID --message "Ping"
```

## Notes

- Tokens are cached at `%USERPROFILE%\.teamscli\msal-cache.json`.
- Config saved at `%USERPROFILE%\.teamscli\config.json`.
- This uses Device Code flow; the CLI will display a code and open the verification URL.
