#!/usr/bin/env node
/**
 * VibeAround Slack Plugin — ACP Client
 *
 * Spawned by the Rust host as a child process.
 * Communicates via ACP protocol (JSON-RPC 2.0 over stdio).
 *
 * Plugin = ACP Client, Host = ACP Agent.
 * Plugin sends prompt() with chatId as sessionId.
 * Host streams back via sessionUpdate notifications.
 */

import { createRequire } from "node:module";

import { runChannelPlugin } from "@vibearound/plugin-channel-sdk";

import { SlackBot } from "./bot.js";
import { AgentStreamHandler } from "./agent-stream.js";

const packageVersion = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

runChannelPlugin({
  name: "vibearound-slack",
  version: packageVersion,
  requiredConfig: ["bot_token", "app_token"],
  createBot: ({ config, agent, log, cacheDir, channelInstanceId, actorId }) =>
    new SlackBot(
      {
        bot_token: config.bot_token as string,
        app_token: config.app_token as string,
      },
      agent,
      log,
      cacheDir,
      channelInstanceId,
      actorId,
    ),
  createRenderer: (bot, _log, verbose) =>
    new AgentStreamHandler(bot, verbose),
  // Heartbeats prove the inbound Socket Mode transport is live. A valid Web
  // API token alone does not mean Slack events can reach this process.
  healthCheck: async (bot) => bot.isConnected(),
});
