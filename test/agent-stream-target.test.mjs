import test from "node:test";
import assert from "node:assert/strict";

import { AgentStreamHandler } from "../dist/agent-stream.js";

function createHandler(overrides = {}) {
  const posted = [];
  const updated = [];
  let sequence = 0;
  const bot = {
    app: {
      client: {
        chat: {
          async postMessage(message) {
            if (overrides.postMessage) return overrides.postMessage(message);
            posted.push(message);
            sequence += 1;
            return { ts: `sent-${sequence}` };
          },
          async update(message) {
            if (overrides.update) return overrides.update(message);
            updated.push(message);
          },
        },
      },
    },
  };
  return {
    handler: new AgentStreamHandler(bot),
    posted,
    updated,
  };
}

function target(overrides = {}) {
  return {
    channelInstanceId: "slack-work",
    actorId: "U_BOT",
    chatId: "C_SHARED",
    topicId: "thread-main",
    replyTo: "message-main",
    ...overrides,
  };
}

function textChunk(text, messageId) {
  return {
    sessionId: "session",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
      messageId,
    },
  };
}

test("Slack sends text, blocks, and permission UI to the explicit topic", async () => {
  const { handler, posted, updated } = createHandler();
  const channelTarget = target();

  await handler.sendText(channelTarget, "plain");
  await handler.sendBlock(channelTarget, "text", "block");
  await handler.onRequestPermission(
    channelTarget,
    {
      sessionId: "session",
      toolCall: { toolCallId: "tool", title: "write" },
      options: [{ kind: "allow_once", optionId: "allow", name: "Allow" }],
    },
    "callback",
  );
  await handler.editBlock(channelTarget, "sent-2", "text", "updated block", true);

  assert.equal(posted.length, 3);
  for (const message of posted) {
    assert.equal(message.channel, "C_SHARED");
    assert.equal(message.thread_ts, "thread-main");
  }
  assert.deepEqual(updated, [
    { channel: "C_SHARED", ts: "sent-2", text: "updated block" },
  ]);
});

test("Slack replyTo alone does not create a thread", async () => {
  const { handler, posted } = createHandler();
  const channelTarget = target({ topicId: undefined, replyTo: "message-root" });

  await handler.sendText(channelTarget, "plain");
  await handler.sendBlock(channelTarget, "text", "block");

  assert.equal(posted.length, 2);
  assert.equal("thread_ts" in posted[0], false);
  assert.equal("thread_ts" in posted[1], false);
});

test("same Slack chat keeps actor, topic, and reply targets isolated across turns", async () => {
  const { handler, posted } = createHandler();
  const targets = [
    target({ actorId: "U_BOT_A", replyTo: "message-a" }),
    target({ actorId: "U_BOT_B", replyTo: "message-a" }),
    target({ topicId: "thread-b", replyTo: "message-a" }),
    target({ replyTo: "message-b" }),
  ];

  targets.forEach((channelTarget, index) => {
    handler.onPromptSent(channelTarget);
    handler.onSessionUpdate(channelTarget, textChunk(`${index}-first`, `chunk-${index}`));
    handler.onSessionUpdate(channelTarget, textChunk("-second", `chunk-${index}`));
  });
  await Promise.all(targets.map((channelTarget) => handler.onTurnEnd(channelTarget)));

  assert.deepEqual(
    posted.map(({ text, thread_ts }) => ({ text, thread_ts })),
    [
      { text: "0-first-second", thread_ts: "thread-main" },
      { text: "1-first-second", thread_ts: "thread-main" },
      { text: "2-first-second", thread_ts: "thread-b" },
      { text: "3-first-second", thread_ts: "thread-main" },
    ],
  );
});

test("sequential Slack turns use each inbound message target without leaking content", async () => {
  const { handler, posted } = createHandler();
  const firstTarget = target({ replyTo: "message-first" });
  const secondTarget = target({ replyTo: "message-second" });

  handler.onPromptSent(firstTarget);
  handler.onSessionUpdate(firstTarget, textChunk("first turn", "chunk-first"));
  await handler.onTurnEnd(firstTarget);

  handler.onPromptSent(secondTarget);
  handler.onSessionUpdate(secondTarget, textChunk("second turn", "chunk-second"));
  await handler.onTurnEnd(secondTarget);

  assert.deepEqual(
    posted.map(({ text, thread_ts }) => ({ text, thread_ts })),
    [
      { text: "first turn", thread_ts: "thread-main" },
      { text: "second turn", thread_ts: "thread-main" },
    ],
  );
});

test("Slack transport failures reject block delivery", async () => {
  const postFailure = new Error("Slack post failed");
  const updateFailure = new Error("Slack update failed");
  const postHandler = createHandler({
    postMessage: async () => { throw postFailure; },
  }).handler;
  const updateHandler = createHandler({
    update: async () => { throw updateFailure; },
  }).handler;

  await assert.rejects(
    postHandler.sendBlock(target(), "text", "block"),
    postFailure,
  );
  await assert.rejects(
    updateHandler.editBlock(target(), "sent-1", "text", "updated", true),
    updateFailure,
  );
});
