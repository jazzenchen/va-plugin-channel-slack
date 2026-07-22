/**
 * Slack stream renderer — extends BlockRenderer with Slack-specific transport.
 */

import {
  BlockRenderer,
  type BlockKind,
  type ChannelTarget,
  type OutboundFile,
  type RequestPermissionRequest,
  type VerboseConfig,
} from "@vibearound/plugin-channel-sdk";
import type { SlackBot } from "./bot.js";

export class AgentStreamHandler extends BlockRenderer<string> {
  private slackBot: SlackBot;

  constructor(slackBot: SlackBot, verbose?: Partial<VerboseConfig>) {
    super({
      streaming: true,
      flushIntervalMs: 500,
      minEditIntervalMs: 1000,
      verbose,
    });
    this.slackBot = slackBot;
  }

  /** Render permission request as a Block Kit actions block. */
  protected async onRequestPermission(
    target: ChannelTarget,
    request: RequestPermissionRequest,
    callbackId: string,
  ): Promise<void> {
    const options = request.options ?? [];
    const toolTitle =
      (request.toolCall as { title?: string } | undefined)?.title ?? "the agent";

    const elements = options.map((opt) => ({
      type: "button" as const,
      action_id: `va_permission_${callbackId}_${opt.optionId}`,
      text: { type: "plain_text" as const, text: opt.name },
      value: JSON.stringify({ callbackId, optionId: opt.optionId, optionName: opt.name }),
      style: slackButtonStyle(opt.kind),
    }));

    await this.slackBot.app.client.chat.postMessage({
      channel: target.chatId,
      ...(target.topicId ? { thread_ts: target.topicId } : {}),
      text: `🔐 Permission required — ${toolTitle}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔐 *Permission required* — \`${toolTitle}\``,
          },
        },
        { type: "actions", elements },
      ],
    });
  }

  protected async sendText(target: ChannelTarget, text: string): Promise<void> {
    await this.slackBot.app.client.chat.postMessage({
      channel: target.chatId,
      text,
      ...(target.topicId ? { thread_ts: target.topicId } : {}),
    });
  }

  protected async sendFile(
    target: ChannelTarget,
    file: OutboundFile,
  ): Promise<void> {
    const upload = {
      channel_id: target.chatId,
      file: file.path,
      filename: file.name,
      title: file.name,
    };
    if (target.topicId) {
      await this.slackBot.app.client.files.uploadV2({
        ...upload,
        thread_ts: target.topicId,
      });
      return;
    }
    await this.slackBot.app.client.files.uploadV2(upload);
  }

  protected formatContent(kind: BlockKind, content: string, _sealed: boolean): string {
    switch (kind) {
      case "thinking": return `_\u{1F4AD} ${content}_`;
      case "tool":     return content.trim();
      case "text":     return content;
    }
  }

  protected async sendBlock(
    target: ChannelTarget,
    _kind: BlockKind,
    content: string,
  ): Promise<string | null> {
    const result = await this.slackBot.app.client.chat.postMessage({
      channel: target.chatId,
      text: content,
      ...(target.topicId ? { thread_ts: target.topicId } : {}),
    });
    return result.ts ?? null;
  }

  protected async editBlock(
    target: ChannelTarget,
    ref: string,
    _kind: BlockKind,
    content: string,
    _sealed: boolean,
  ): Promise<void> {
    await this.slackBot.app.client.chat.update({
      channel: target.chatId,
      ts: ref,
      text: content,
    });
  }
}

/** Map permission option kinds to Slack Block Kit button styles. */
function slackButtonStyle(kind: string): "primary" | "danger" | undefined {
  switch (kind) {
    case "allow_once":
    case "allow_always":
      return "primary";
    case "reject_once":
    case "reject_always":
      return "danger";
    default:
      return undefined;
  }
}
