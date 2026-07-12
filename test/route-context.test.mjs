import test from "node:test";
import assert from "node:assert/strict";

import {
  createSlackChannelContext,
  isSlackDm,
  parseSlackCommandText,
} from "../dist/route-context.js";

test("Slack keeps the host instance stable and addresses the real bot", () => {
  assert.deepEqual(
    createSlackChannelContext(
      {
        channelInstanceId: "slack-primary",
        actorId: "codex-reviewer",
        botUserId: "U_BOT",
      },
      {
        chatId: "C_GROUP",
        topicId: "1710000000.000001",
        senderId: "U_SENDER",
        platformMessageId: "1710000000.000002",
        scope: "group",
        addressedBy: "mention",
      },
    ),
    {
      channelInstanceId: "slack-primary",
      actorId: "U_BOT",
      chatId: "C_GROUP",
      topicId: "1710000000.000001",
      senderId: "U_SENDER",
      platformMessageId: "1710000000.000002",
      scope: "group",
      addressedBy: "mention",
    },
  );
});

test("Slack identifies direct-message channel ids", () => {
  assert.equal(isSlackDm("D012345"), true);
  assert.equal(isSlackDm("C012345"), false);
});

test("Slack direct-message commands do not require a bot mention", () => {
  assert.equal(parseSlackCommandText("status", "dm", "U_BOT"), "status");
  assert.equal(parseSlackCommandText("  status  ", "dm", null), "status");
});

test("Slack group commands require and strip the current bot mention", () => {
  assert.equal(parseSlackCommandText("status", "group", "U_BOT"), null);
  assert.equal(parseSlackCommandText("<@U_OTHER> status", "group", "U_BOT"), null);
  assert.equal(parseSlackCommandText("<@U_BOT> status", "group", "U_BOT"), "status");
  assert.equal(parseSlackCommandText("<@U_BOT>", "group", "U_BOT"), "");
  assert.equal(parseSlackCommandText("<@U_BOT> status", "group", null), null);
});
