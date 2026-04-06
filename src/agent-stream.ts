/**
 * AgentStreamHandler — receives ACP session updates from the Host and renders
 * them as Slack messages with Block Kit formatting.
 *
 * Extends BlockRenderer from @vibearound/plugin-channel-sdk.
 * TRef = string (Slack message timestamp, used for chat.update).
 */

import {
  BlockRenderer,
  type BlockKind,
  type VerboseConfig,
} from "@vibearound/plugin-channel-sdk";
import type { SlackBot } from "./bot.js";

type LogFn = (level: string, msg: string) => void;

export class AgentStreamHandler extends BlockRenderer<string> {
  private slackBot: SlackBot;
  private log: LogFn;
  private lastChannelId: string | null = null;

  constructor(slackBot: SlackBot, log: LogFn, verbose?: Partial<VerboseConfig>) {
    super({
      flushIntervalMs: 500,
      minEditIntervalMs: 1000,  // Slack rate limit ~1 msg/sec per channel
      verbose,
    });
    this.slackBot = slackBot;
    this.log = log;
  }

  /** Format content with Slack mrkdwn. */
  protected formatContent(kind: BlockKind, content: string, _sealed: boolean): string {
    switch (kind) {
      case "thinking": return `_\u{1F4AD} ${content}_`;
      case "tool":     return content.trim();
      case "text":     return content;
    }
  }

  /** Send a new message via Slack API. Returns the message ts for editing. */
  protected async sendBlock(channelId: string, _kind: BlockKind, content: string): Promise<string | null> {
    try {
      const result = await this.slackBot.app.client.chat.postMessage({
        channel: channelId,
        text: content,
        // Use mrkdwn for rich formatting
      });
      return result.ts ?? null;
    } catch (e) {
      this.log("error", `sendBlock failed: ${e}`);
      return null;
    }
  }

  /** Edit an existing message for streaming updates. */
  protected async editBlock(
    channelId: string,
    ref: string,
    _kind: BlockKind,
    content: string,
    _sealed: boolean,
  ): Promise<void> {
    try {
      await this.slackBot.app.client.chat.update({
        channel: channelId,
        ts: ref,
        text: content,
      });
    } catch (e) {
      this.log("error", `editBlock failed: ${e}`);
    }
  }

  protected async onAfterTurnEnd(channelId: string): Promise<void> {
    this.log("debug", `turn_complete session=${channelId}`);
  }

  protected async onAfterTurnError(channelId: string, error: string): Promise<void> {
    try {
      await this.slackBot.app.client.chat.postMessage({
        channel: channelId,
        text: `\u274C Error: ${error}`,
      });
    } catch {
      // ignore send error
    }
  }

  onPromptSent(channelId: string): void {
    this.lastChannelId = channelId;
    super.onPromptSent(channelId);
  }

  onAgentReady(agent: string, version: string): void {
    if (this.lastChannelId) {
      this.slackBot.app.client.chat.postMessage({
        channel: this.lastChannelId,
        text: `\u{1F916} Agent: ${agent} v${version}`,
      }).catch(() => {});
    }
  }

  onSessionReady(sessionId: string): void {
    if (this.lastChannelId) {
      this.slackBot.app.client.chat.postMessage({
        channel: this.lastChannelId,
        text: `\u{1F4CB} Session: ${sessionId}`,
      }).catch(() => {});
    }
  }

  onSystemText(text: string): void {
    if (this.lastChannelId) {
      this.slackBot.app.client.chat.postMessage({
        channel: this.lastChannelId,
        text,
      }).catch(() => {});
    }
  }
}
