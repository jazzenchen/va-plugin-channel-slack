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

import { runChannelPlugin } from "@vibearound/plugin-channel-sdk";

import { SlackBot } from "./bot.js";
import { AgentStreamHandler } from "./agent-stream.js";

runChannelPlugin({
  name: "vibearound-slack",
  version: "0.1.0",
  requiredConfig: ["bot_token", "app_token"],
  createBot: ({ config, agent, log, cacheDir }) =>
    new SlackBot(
      {
        bot_token: config.bot_token as string,
        app_token: config.app_token as string,
      },
      agent,
      log,
      cacheDir,
    ),
  createRenderer: (bot, log, verbose) =>
    new AgentStreamHandler(bot, log, verbose),
  // Heartbeat health check — auth.test() is a cheap per-call verification
  // that our tokens + Socket Mode are still working.
  healthCheck: async (bot) => {
    try {
      const res = await bot.app.client.auth.test();
      return res.ok === true;
    } catch {
      return false;
    }
  },
});
