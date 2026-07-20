import assert from "node:assert/strict";
import test from "node:test";

import { SlackBot } from "../dist/bot.js";

function genericActionHandler(agent) {
  const actions = [];
  const bot = Object.create(SlackBot.prototype);
  bot.agent = agent;
  bot.log = () => {};
  bot.channelInstanceId = "slack-primary";
  bot.actorId = "slack-bot";
  bot.botUserId = "U_BOT";
  bot.app = {
    message() {},
    event() {},
    command() {},
    action(pattern, handler) {
      actions.push({ pattern, handler });
    },
  };
  bot.registerHandlers();
  return actions[1].handler;
}

test("Slack generic callback delivery failures reach the handler boundary", async () => {
  const failure = new Error("callback delivery failed");
  const handler = genericActionHandler({
    async extNotification() {
      throw failure;
    },
  });
  let acknowledgements = 0;

  await assert.rejects(
    handler({
      action: { action_id: "va_action_retry", value: "retry" },
      ack: async () => {
        acknowledgements += 1;
      },
      body: {
        channel: { id: "C_CHANNEL" },
        user: { id: "U_USER", name: "Test User" },
        message: { ts: "1710000000.000001" },
      },
    }),
    failure,
  );

  assert.equal(acknowledgements, 1);
});
