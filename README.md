# VibeAround Slack Plugin

Slack channel plugin for VibeAround. It uses Slack Bolt with Socket Mode, so no public webhook URL is required.

## Features

- Direct-message chat through `message.im`
- Channel chat when the bot is mentioned through `app_mention`
- `/va` and `/vibearound` slash commands
- Streaming replies via Slack message updates
- Permission buttons through Slack interactivity
- File input through `files:read`

## Slack App Manifest

Create the Slack app from `slack-app-manifest.json` in this directory, or paste that JSON into **Slack API** -> **Your Apps** -> **Create New App** -> **From an app manifest**.

The manifest enables:

- Bot scopes: `files:read`, `app_mentions:read`, `chat:write`, `commands`, `im:history`, `im:read`, `im:write`
- Bot events: `app_mention`, `message.im`
- Socket Mode and interactivity
- Slash commands: `/va`, `/vibearound`

After creating the app, generate an App-Level Token for Socket Mode with `connections:write`, then install the app to the workspace and copy the Bot User OAuth Token.

## VibeAround Configuration

Add this to `~/.vibearound/settings.json`:

```json
{
  "channels": {
    "slack": {
      "bot_token": "xoxb-...",
      "app_token": "xapp-...",
      "verbose": {
        "show_thinking": false,
        "show_tool_use": false
      }
    }
  }
}
```

## Usage

- In a DM, send a normal message to VibeAround.
- In a channel, mention the bot, for example `@VibeAround help me review this PR`.
- Use `/va help`, `/va switch claude`, or `/vibearound help` for VibeAround slash commands.

## Development

```bash
npm install
npm run build
```

Built with [@vibearound/plugin-channel-sdk](https://www.npmjs.com/package/@vibearound/plugin-channel-sdk) and [@slack/bolt](https://slack.dev/bolt-js/).
