/**
 * SlackBot — Bolt app wrapper for Slack Socket Mode.
 *
 * Handles:
 *   - Bot creation and Socket Mode lifecycle
 *   - Inbound DM, app mention, and slash-command parsing -> ACP prompt() to Host
 *   - Action handling for interactive components
 */

import path from "node:path";
import { App } from "@slack/bolt";
import type { AppMentionEvent, GenericMessageEvent } from "@slack/types";
import type {
  Agent,
  ChannelInboundContext,
  ContentBlock,
} from "@vibearound/plugin-channel-sdk";
import {
  cancelChannelPrompt,
  extractErrorMessage,
  isChannelStopCommand,
  sendChannelPrompt,
} from "@vibearound/plugin-channel-sdk";
import type { AgentStreamHandler } from "./agent-stream.js";
import { downloadSlackFile } from "./media-download.js";
import { createSlackChannelContext, isSlackDm } from "./route-context.js";

export interface SlackConfig {
  bot_token: string;
  app_token: string;
}

type LogFn = (level: string, msg: string) => void;

type SlackInboundFile = {
  id?: string;
  mimetype?: string;
  name?: string | null;
  title?: string | null;
  url_private?: string;
};

export class SlackBot {
  readonly app: App;
  private agent: Agent;
  private log: LogFn;
  private cacheDir: string;
  private channelInstanceId: string;
  private actorId: string;
  private streamHandler: AgentStreamHandler | null = null;
  private botUserId: string | null = null;

  constructor(
    config: SlackConfig,
    agent: Agent,
    log: LogFn,
    cacheDir: string,
    channelInstanceId: string,
    actorId: string,
  ) {
    this.agent = agent;
    this.log = log;
    this.cacheDir = cacheDir;
    this.channelInstanceId = channelInstanceId;
    this.actorId = actorId;

    this.app = new App({
      token: config.bot_token,
      appToken: config.app_token,
      socketMode: true,
      // Disable built-in HTTP receiver — we're stdio-only
    });

    this.registerHandlers();
  }

  setStreamHandler(handler: AgentStreamHandler): void {
    this.streamHandler = handler;
  }

  async start(): Promise<void> {
    await this.app.start();
    // Get bot user ID for filtering
    const auth = await this.app.client.auth.test();
    this.botUserId = auth.user_id as string;
    this.log("info", `bot started (Socket Mode), bot_user_id=${this.botUserId}`);
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }

  private registerHandlers(): void {
    // Listen for DM messages only
    this.app.message(async ({ message }) => {
      // Filter: only handle DM messages (channel_type === 'im')
      const msg = message as GenericMessageEvent;
      if (msg.channel_type !== "im") return;

      // Ignore bot's own messages, edits, and deletes — but allow file_share
      if (msg.subtype && msg.subtype !== "file_share") return;
      if (msg.bot_id) return;
      if (msg.user === this.botUserId) return;

      const chatId = msg.channel;
      const text = msg.text ?? "";
      const userId = msg.user;

      if (!text && (!msg.files || msg.files.length === 0)) return;

      this.log("debug", `dm chat=${chatId} user=${userId} text=${text.slice(0, 80)}`);

      const contentBlocks = await this.buildContentBlocks(chatId, text, msg.files);
      if (contentBlocks.length === 0) return;

      const context = this.channelContext({
        chatId,
        topicId: msg.thread_ts,
        senderId: userId,
        platformMessageId: msg.ts,
        scope: "dm",
        addressedBy: "dm",
      });

      if (text && await this.cancelIfRequested(text, context, "dm")) return;

      // If a permission prompt is awaiting text, consume this message and stop.
      if (text && this.streamHandler?.consumePendingText(chatId, text)) return;

      await this.promptAgent(context, contentBlocks, "dm");
    });

    this.app.event("app_mention", async ({ event }) => {
      const mention = event as AppMentionEvent;
      if (mention.subtype && mention.subtype !== "file_share") return;
      if (mention.bot_id) return;
      if (mention.user === this.botUserId) return;

      const chatId = mention.channel;
      const rawText = mention.text ?? "";
      const text = this.stripBotMention(rawText);
      const files = mention.files as SlackInboundFile[] | undefined;

      if (!text && (!files || files.length === 0)) return;

      this.log("debug", `mention chat=${chatId} user=${mention.user ?? ""} text=${text.slice(0, 80)}`);

      const contentBlocks = await this.buildContentBlocks(chatId, text, files);
      if (contentBlocks.length === 0) return;

      const context = this.channelContext({
        chatId,
        topicId: mention.thread_ts,
        senderId: mention.user,
        platformMessageId: mention.ts,
        scope: "group",
        addressedBy: "mention",
      });

      if (text && await this.cancelIfRequested(text, context, "mention")) return;

      // If a permission prompt is awaiting text, consume this message and stop.
      if (text && this.streamHandler?.consumePendingText(chatId, text)) return;

      await this.promptAgent(context, contentBlocks, "mention");
    });

    // Handle /va and /vibearound slash commands — forward as /<rest> to the agent
    for (const cmd of ["/va", "/vibearound"]) {
      this.app.command(cmd, async ({ command, ack }) => {
        await ack();
        const chatId = command.channel_id;
        const text = command.text?.trim() ?? "";
        const userId = command.user_id;

        // Reconstruct as a slash command: "/va help" → "/va help" (parser strips prefix)
        const fullText = text ? `${cmd} ${text}` : cmd;
        this.log("debug", `slash cmd=${cmd} chat=${chatId} user=${userId} text=${text}`);

        const contentBlocks: ContentBlock[] = [{ type: "text", text: fullText }];
        const context = this.channelContext({
          chatId,
          topicId: (command as typeof command & { thread_ts?: string }).thread_ts,
          senderId: userId,
          platformMessageId: command.trigger_id,
          scope: isSlackDm(chatId) ? "dm" : "group",
          addressedBy: isSlackDm(chatId) ? "dm" : "callback",
        });
        if (await this.cancelIfRequested(fullText, context, `slash ${cmd}`)) return;
        await this.promptAgent(context, contentBlocks, `slash ${cmd}`);
      });
    }

    // Handle permission button clicks — route back to renderer's pending
    // promise and replace the message so the buttons disappear.
    this.app.action(/^va_permission_.*/, async ({ action, ack, respond }) => {
      await ack();
      try {
        const raw = (action as any).value;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const callbackId = parsed?.callbackId;
        const optionId = parsed?.optionId;
        const optionName = parsed?.optionName ?? optionId ?? "";
        if (!callbackId || !optionId) return;

        const ok = this.streamHandler?.resolvePermission(callbackId, optionId) ?? false;
        this.log("info", `permission resolve cb=${callbackId} option=${optionId} ok=${ok}`);

        // Replace the original message. `replace_original: true` tells Slack
        // to swap the message in place — buttons are gone, no double-click.
        await respond({
          replace_original: true,
          text: ok
            ? `🔐 Permission — selected: *${optionName}*`
            : `🔐 Permission — request already handled`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: ok
                  ? `🔐 Permission — selected: *${optionName}*`
                  : `🔐 Permission — request already handled`,
              },
            },
          ],
        });
      } catch (e) {
        this.log("error", `permission action parse failed: ${e}`);
      }
    });

    // Handle other interactive actions (generic callbacks to host).
    this.app.action(/^va_action_.*/, async ({ action, ack, body }) => {
      await ack();
      const channelId = (body as any).channel?.id;
      if (!channelId) return;

      const context = this.channelContext({
        chatId: channelId,
        topicId: (body as any).message?.thread_ts,
        senderId: (body as any).user?.id,
        platformMessageId: (body as any).message?.ts,
        scope: isSlackDm(channelId) ? "dm" : "group",
        addressedBy: "callback",
      });

      this.agent.extNotification?.("_va/callback", {
        chatId: channelId,
        callbackId: (action as any).action_id,
        sender: {
          id: (body as any).user?.id ?? "",
          name: (body as any).user?.name ?? "",
        },
        data: (action as any).value ?? (action as any).selected_option?.value ?? "",
        "va.channel": context,
      }).catch(() => {});
    });
  }

  private async buildContentBlocks(
    chatId: string,
    text: string,
    files?: SlackInboundFile[],
  ): Promise<ContentBlock[]> {
    const contentBlocks: ContentBlock[] = [];

    if (text) {
      contentBlocks.push({ type: "text", text });
    }

    // Handle file attachments — download locally since Slack URLs need auth.
    for (const file of files ?? []) {
      const isImage = file.mimetype?.startsWith("image/") ?? false;
      const fileName = file.name ?? file.title ?? undefined;

      if (!text) {
        contentBlocks.push({
          type: "text",
          text: `The user sent ${isImage ? "an image" : "a file"}: ${fileName ?? "unnamed"}`,
        });
      }

      if (file.url_private && file.id) {
        const media = await downloadSlackFile({
          botToken: this.app.client.token!,
          urlPrivate: file.url_private,
          fileId: file.id,
          cacheDir: this.cacheDir,
          chatId,
          mimeType: file.mimetype ?? "application/octet-stream",
          fileName,
        });
        if (media) {
          contentBlocks.push({
            type: "resource_link",
            uri: `file://${media.path}`,
            name: media.fileName ?? path.basename(media.path),
            mimeType: media.mimeType,
          });
        }
      }
    }

    return contentBlocks;
  }

  private async promptAgent(
    context: ChannelInboundContext,
    contentBlocks: ContentBlock[],
    source: string,
  ): Promise<void> {
    const chatId = context.chatId;
    this.streamHandler?.onPromptSent(chatId);

    try {
      const response = await sendChannelPrompt(this.agent, {
        context,
        prompt: contentBlocks,
      });
      if (!response) {
        this.streamHandler?.onTurnEnd(chatId);
        return;
      }
      this.log("info", `${source} prompt done chat=${chatId} stopReason=${response.stopReason}`);
      this.streamHandler?.onTurnEnd(chatId);
    } catch (error: unknown) {
      const errMsg = extractErrorMessage(error);
      this.log("error", `${source} prompt failed chat=${chatId}: ${errMsg}`);
      this.streamHandler?.onTurnError(chatId, errMsg);
    }
  }

  private channelContext(
    route: Omit<ChannelInboundContext, "channelInstanceId" | "actorId">,
  ): ChannelInboundContext {
    return createSlackChannelContext(
      {
        channelInstanceId: this.channelInstanceId,
        actorId: this.actorId,
        botUserId: this.botUserId,
      },
      route,
    );
  }

  private async cancelIfRequested(
    text: string,
    context: ChannelInboundContext,
    source: string,
  ): Promise<boolean> {
    if (!isChannelStopCommand(text)) return false;

    try {
      const cancelled = await cancelChannelPrompt(this.agent, { context });
      this.log("info", `${source} cancel requested chat=${context.chatId} sent=${cancelled}`);
    } catch (error: unknown) {
      this.log(
        "error",
        `${source} cancel failed chat=${context.chatId}: ${extractErrorMessage(error)}`,
      );
    }
    return true;
  }

  private stripBotMention(text: string): string {
    if (!this.botUserId) return text.trim();
    const mention = new RegExp(`^<@${escapeRegExp(this.botUserId)}>(?:\\s+|$)`);
    return text.replace(mention, "").trim();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
