/**
 * 型定義
 */

export interface DiscordMessageResponse {
  id: string;
  channel_id: string;
  content: string;
  embeds?: Array<Record<string, unknown>>;
  timestamp: string;
}

export type DiscordWebhookError =
  | { type: "webhook_error"; status: number; statusText: string; body: string }
  | { type: "validation_error"; field: string; message: string }
  | { type: "unknown_error"; message: string };

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedAuthor {
  name?: string;
  url?: string;
  icon_url?: string;
}

export interface EmbedFooter {
  text: string;
  icon_url?: string;
}

export interface EmbedImage {
  url: string;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: EmbedFooter;
  image?: EmbedImage;
  thumbnail?: EmbedImage;
  author?: EmbedAuthor;
  fields?: EmbedField[];
}

export interface AllowedMentions {
  parse?: Array<"roles" | "users" | "everyone">;
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
}

export interface SendMessageParams {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: Embed[];
  allowed_mentions?: AllowedMentions;
  thread_id?: string;
  thread_name?: string;
}

export interface EditMessageParams {
  message_id: string;
  content?: string;
  embeds?: Embed[];
  allowed_mentions?: AllowedMentions;
}

export interface DeleteMessageParams {
  message_id: string;
}
