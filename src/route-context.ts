import type {
  AddressedBy,
  ChannelInboundContext,
  ConversationScope,
} from "@vibearound/plugin-channel-sdk";

export interface SlackRouteIdentity {
  channelInstanceId: string;
  actorId: string;
  botUserId?: string | null;
}

export interface SlackInboundRoute {
  chatId: string;
  topicId?: string;
  senderId?: string;
  platformMessageId?: string;
  scope: ConversationScope;
  addressedBy: AddressedBy;
}

/** Keep the host instance stable; use Slack's bot user ID as the addressed actor. */
export function createSlackChannelContext(
  identity: SlackRouteIdentity,
  route: SlackInboundRoute,
): ChannelInboundContext {
  return {
    channelInstanceId: identity.channelInstanceId,
    actorId: identity.botUserId ?? identity.actorId,
    ...route,
  };
}

export function isSlackDm(chatId: string): boolean {
  return chatId.startsWith("D");
}

/**
 * Slash commands in group conversations must explicitly address this bot.
 * DMs are already private to the bot and therefore need no mention.
 */
export function parseSlackCommandText(
  text: string,
  scope: ConversationScope,
  botUserId: string | null,
): string | null {
  const trimmed = text.trim();
  if (scope === "dm") return trimmed;
  if (!botUserId) return null;

  const mention = new RegExp(`^<@${escapeRegExp(botUserId)}>(?:\\s+|$)`);
  if (!mention.test(trimmed)) return null;
  return trimmed.replace(mention, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
