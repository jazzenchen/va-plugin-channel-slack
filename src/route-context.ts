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

/** Build the platform-neutral route while preferring Slack's real bot user ID. */
export function createSlackChannelContext(
  identity: SlackRouteIdentity,
  route: SlackInboundRoute,
): ChannelInboundContext {
  return {
    channelInstanceId: identity.botUserId ?? identity.channelInstanceId,
    actorId: identity.actorId,
    ...route,
  };
}

export function isSlackDm(chatId: string): boolean {
  return chatId.startsWith("D");
}
