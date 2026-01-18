/**
 * Zodバリデーションスキーマ
 */

import { z } from "zod";
import { MAX_CONTENT_LENGTH, MAX_EMBEDS, MAX_FIELDS } from "./constants.js";

// Embedフィールド
export const EmbedFieldSchema = z.object({
  name: z.string().min(1).describe("フィールド名"),
  value: z.string().min(1).describe("フィールドの値"),
  inline: z.boolean().optional().default(false).describe("横並び表示"),
}).strict();

// Embed（Discord公式ドキュメント準拠）
export const EmbedSchema = z.object({
  title: z.string().max(256).optional().describe("Embedのタイトル"),
  url: z.string().url().optional().describe("タイトルにリンクを設定"),
  description: z.string().max(4096).optional().describe("説明文（マークダウン対応）"),
  timestamp: z.string().optional().describe("ISO 8601形式の日時 (例: 2025-06-29T16:34:10Z)"),
  color: z.number().int().min(0).max(16777215).optional().describe("左端の色 (16進数色コード、例: 0x00FF00は緑)"),
  footer: z
    .object({
      text: z.string().min(1).max(2048).describe("フッターのテキスト"),
      icon_url: z.string().url().optional().describe("アイコンURL"),
    })
    .strict()
    .optional(),
  image: z.object({ url: z.string().url().describe("画像URL") }).strict().optional(),
  thumbnail: z.object({ url: z.string().url().describe("画像URL") }).strict().optional(),
  author: z
    .object({
      name: z.string().min(1).max(256).describe("著者名"),
      url: z.string().url().optional().describe("リンクURL"),
      icon_url: z.string().url().optional().describe("アイコンURL"),
    })
    .strict()
    .optional(),
  fields: z
    .array(EmbedFieldSchema)
    .max(MAX_FIELDS)
    .optional()
    .describe(`フィールドの配列 (最大${MAX_FIELDS}個)`),
}).strict();

// 許可されたメンション
export const AllowedMentionsSchema = z.object({
  parse: z
    .array(z.enum(["roles", "users", "everyone"]))
    .optional()
    .describe("解析するメンションタイプ"),
  roles: z.array(z.string()).optional().describe("許可するロールID"),
  users: z.array(z.string()).optional().describe("許可するユーザーID"),
  replied_user: z.boolean().optional().default(false).describe("リプライ時に自分をメンション"),
}).strict();

// Discordメッセージ送信リクエスト
export const SendMessageSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_LENGTH)
    .optional()
    .describe(`メッセージ内容 (最大${MAX_CONTENT_LENGTH}文字)`),
  username: z.string().max(80).optional().describe("Webhookのユーザー名を上書き"),
  avatar_url: z.string().url().optional().describe("WebhookのアバターURLを上書き"),
  tts: z.boolean().optional().default(false).describe("テキスト読み上げ (TTS)"),
  embeds: z.array(EmbedSchema).max(MAX_EMBEDS).optional().describe(`Embedの配列 (最大${MAX_EMBEDS}個)`),
  allowed_mentions: AllowedMentionsSchema.optional().describe("許可されたメンション設定"),
  thread_id: z.string().optional().describe("送信先スレッドID (自動アーカイブ解除)"),
  thread_name: z.string().max(100).optional().describe("作成するスレッド名 (フォーラム/メディアチャンネルのみ)"),
}).strict();

// メッセージ編集リクエスト（content、embeds、allowed_mentions のみ変更可能）
export const EditMessageSchema = z.object({
  message_id: z.string().min(1).describe("編集するメッセージID"),
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_LENGTH)
    .optional()
    .describe(`新しいメッセージ内容 (最大${MAX_CONTENT_LENGTH}文字)`),
  embeds: z.array(EmbedSchema).max(MAX_EMBEDS).optional().describe(`新しいEmbedの配列 (最大${MAX_EMBEDS}個)`),
  allowed_mentions: AllowedMentionsSchema.optional().describe("許可されたメンション設定"),
}).strict();

// メッセージ削除リクエスト
export const DeleteMessageSchema = z.object({
  message_id: z.string().min(1).describe("削除するメッセージID"),
}).strict();

// 型エイリアス
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type EditMessageInput = z.infer<typeof EditMessageSchema>;
export type DeleteMessageInput = z.infer<typeof DeleteMessageSchema>;
