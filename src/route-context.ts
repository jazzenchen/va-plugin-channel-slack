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
