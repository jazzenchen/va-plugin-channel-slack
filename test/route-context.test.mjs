import test from "node:test";
import assert from "node:assert/strict";

import { createSlackChannelContext, isSlackDm } from "../dist/route-context.js";

test("Slack route metadata prefers the real bot identity and preserves threads", () => {
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
      channelInstanceId: "U_BOT",
      actorId: "codex-reviewer",
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
