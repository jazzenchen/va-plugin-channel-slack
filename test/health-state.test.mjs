import assert from "node:assert/strict";
import test from "node:test";

import { SlackBot } from "../dist/bot.js";

test("health follows the Socket Mode WebSocket state", () => {
  const bot = Object.create(SlackBot.prototype);
  let active = false;
  bot.receiver = {
    client: {
      websocket: { isActive: () => active },
    },
  };

  assert.equal(bot.isConnected(), false);
  active = true;
  assert.equal(bot.isConnected(), true);
  bot.receiver.client.websocket = undefined;
  assert.equal(bot.isConnected(), false);
});
