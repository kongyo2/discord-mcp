import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ResultAsync } from "neverthrow";

// Discord公式ドキュメント: https://github.com/discord/discord-api-docs/blob/main/docs/resources/webhook.mdx
// MCP公式ドキュメント: https://modelcontextprotocol.io/specification/draft/server/tools.md

// エラー型の定義
type DiscordWebhookError =
  | { type: "webhook_error"; status: number; statusText: string; body: string }
  | { type: "validation_error"; field: string; message: string }
  | { type: "unknown_error"; message: string };

// 環境変数からWebhook URLを取得
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  process.stderr.write("DISCORD_WEBHOOK_URL environment variable is not set\n");
  process.stderr.write("Please set DISCORD_WEBHOOK_URL before running this server\n");
  process.exit(1);
}

// MCPサーバーインスタンスを作成
const server = new Server(
  {
    name: "discord-webhook",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============ Zodスキーマ定義 ============

// Embedフィールド
const EmbedFieldSchema = z.object({
  name: z.string().describe("フィールド名"),
  value: z.string().describe("フィールドの値"),
  inline: z.boolean().optional().default(false).describe("横並び表示"),
});

// Embed（Discord公式ドキュメント準拠）
const EmbedSchema = z.object({
  title: z.string().optional().describe("Embedのタイトル"),
  url: z.string().url().optional().describe("タイトルにリンクを設定"),
  description: z.string().optional().describe("説明文（マークダウン対応）"),
  timestamp: z.string().optional().describe("ISO 8601形式の日時 (例: 2025-06-29T16:34:10Z)"),
  color: z.number().optional().describe("左端の色 (16進数色コード、例: 0x00FF00は緑)"),
  footer: z
    .object({
      text: z.string().describe("フッターのテキスト"),
      icon_url: z.string().url().optional().describe("アイコンURL"),
    })
    .optional(),
  image: z.object({ url: z.string().url().describe("画像URL") }).optional(),
  thumbnail: z.object({ url: z.string().url().describe("画像URL") }).optional(),
  author: z
    .object({
      name: z.string().describe("著者名"),
      url: z.string().url().optional().describe("リンクURL"),
      icon_url: z.string().url().optional().describe("アイコンURL"),
    })
    .optional(),
  fields: z.array(EmbedFieldSchema).optional().describe("フィールドの配列 (最大25個)"),
});

// 許可されたメンション
const AllowedMentionsSchema = z.object({
  parse: z
    .array(z.enum(["roles", "users", "everyone"]))
    .optional()
    .describe("解析するメンションタイプ"),
  roles: z.array(z.string()).optional().describe("許可するロールID"),
  users: z.array(z.string()).optional().describe("許可するユーザーID"),
  replied_user: z.boolean().optional().default(false).describe("リプライ時に自分をメンション"),
});

// Discordメッセージ送信リクエスト
const SendMessageSchema = z.object({
  content: z.string().min(1).max(2000).optional().describe("メッセージ内容 (最大2000文字)"),
  username: z.string().optional().describe("Webhookのユーザー名を上書き"),
  avatar_url: z.string().url().optional().describe("WebhookのアバターURLを上書き"),
  tts: z.boolean().optional().default(false).describe("テキスト読み上げ (TTS)"),
  embeds: z
    .array(EmbedSchema)
    .max(10)
    .optional()
    .describe("Embedの配列 (最大10個)"),
  allowed_mentions: AllowedMentionsSchema.optional().describe("許可されたメンション設定"),
  thread_id: z.string().optional().describe("送信先スレッドID (自動アーカイブ解除)"),
  thread_name: z.string().optional().describe("作成するスレッド名 (フォーラム/メディアチャンネルのみ)"),
});

// ============ 型定義 ============

interface DiscordMessageResponse {
  id: string;
  channel_id: string;
  content: string;
  embeds?: Array<Record<string, unknown>>;
  timestamp: string;
}

// 型ガード関数
function isWebhookError(error: DiscordWebhookError): error is Extract<DiscordWebhookError, { type: "webhook_error" }> {
  return error.type === "webhook_error";
}

// ============ Discord API通信 ============

// Discordにメッセージを送信（Result型を返す）
function sendToDiscord(
  payload: Record<string, unknown>,
  wait: boolean = false
): ResultAsync<DiscordMessageResponse | null, DiscordWebhookError> {
  const url = new URL(WEBHOOK_URL!);
  if (wait) url.searchParams.set("wait", "true");

  return ResultAsync.fromPromise(
    fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          })
        );
      }

      // wait=trueの場合はメッセージ情報が返る
      if (wait) {
        return (await response.json()) as DiscordMessageResponse;
      }

      return null;
    }),
    (error) => {
      if (error instanceof Error && error.message.startsWith("{")) {
        try {
          const parsed = JSON.parse(error.message);
          return {
            type: "webhook_error" as const,
            status: parsed.status,
            statusText: parsed.statusText,
            body: parsed.body,
          };
        } catch {
          return {
            type: "unknown_error" as const,
            message: error.message,
          };
        }
      }
      return {
        type: "unknown_error" as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  );
}

// エラーメッセージを整形
function formatError(error: DiscordWebhookError): string {
  switch (error.type) {
    case "webhook_error":
      return `Discord Webhook error: ${error.status} ${error.statusText}\n${error.body}`;
    case "validation_error":
      return `Validation error: ${error.field} - ${error.message}`;
    case "unknown_error":
      return `Unknown error: ${error.message}`;
  }
}

// ============ ツール定義 ============

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_message",
        title: "Discord Message Sender",
        description:
          "Discordチャンネルにメッセージを送信します。" +
          "content、embedsのいずれか最低1つが必要です。" +
          "環境変数DISCORD_WEBHOOK_URLに設定されたWebhookを使用します。",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "メッセージ内容（1-2000文字、content/embeds/file/poll/componentsのいずれかが必要）",
            },
            username: {
              type: "string",
              description: "Webhookのユーザー名を上書き（例: Bot Name）",
            },
            avatar_url: {
              type: "string",
              description: "Webhookのアバター画像をURLで指定",
            },
            tts: {
              type: "boolean",
              description: "テキスト読み上げ（TTS）メッセージとして送信",
            },
            embeds: {
              type: "array",
              description: "Embedの配列（最大10個、リッチコンテンツ用）",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Embedのタイトル" },
                  url: { type: "string", description: "タイトルにリンクを設定" },
                  description: { type: "string", description: "説明文（マークダウン対応）" },
                  timestamp: { type: "string", description: "ISO 8601形式の日時" },
                  color: { type: "number", description: "左端の色（16進数、例: 0x00FF00は緑）" },
                  footer: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "フッターのテキスト" },
                      icon_url: { type: "string", description: "アイコンURL" },
                    },
                  },
                  image: { type: "object", properties: { url: { type: "string", description: "画像URL" } } },
                  thumbnail: { type: "object", properties: { url: { type: "string", description: "画像URL" } } },
                  author: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "著者名" },
                      url: { type: "string", description: "リンクURL" },
                      icon_url: { type: "string", description: "アイコンURL" },
                    },
                  },
                  fields: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "フィールド名" },
                        value: { type: "string", description: "フィールドの値" },
                        inline: { type: "boolean", description: "横並び表示" },
                      },
                    },
                  },
                },
              },
            },
            allowed_mentions: {
              type: "object",
              description: "許可されたメンション設定",
              properties: {
                parse: { type: "array", items: { type: "string", enum: ["roles", "users", "everyone"] } },
                roles: { type: "array", items: { type: "string" } },
                users: { type: "array", items: { type: "string" } },
                replied_user: { type: "boolean" },
              },
            },
            thread_id: {
              type: "string",
              description: "送信先スレッドID（指定したスレッドに送信、スレッドは自動アーカイブ解除）",
            },
            thread_name: {
              type: "string",
              description: "作成するスレッド名（フォーラム/メディアチャンネルのみで新しいスレッドを作成）",
            },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            success: { type: "boolean", description: "送信が成功したか" },
            message_id: { type: "string", description: "送信されたメッセージのID" },
            channel_id: { type: "string", description: "送信先チャンネルID" },
            timestamp: { type: "string", description: "送信日時" },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ],
  };
});

// ============ ツール呼び出しハンドラ ============

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "send_message") {
    const parsed = SendMessageSchema.parse(args);

    // content, embeds, file, poll, components のうち1つが必要
    const hasContent = parsed.content && parsed.content.length > 0;
    const hasEmbeds = parsed.embeds && parsed.embeds.length > 0;

    if (!hasContent && !hasEmbeds) {
      const errorResponse = {
        content: [
          {
            type: "text",
            text: "エラー: content、embeds、file、poll、components のうち最低1つを指定してください",
          },
        ],
        structuredContent: {
          success: false,
          error: {
            type: "validation_error",
            field: "content/embeds",
            message: "content、embeds、file、poll、components のうち最低1つを指定してください",
          },
        },
        isError: true,
      };
      return errorResponse;
    }

    const payload: Record<string, unknown> = {};

    if (hasContent) payload.content = parsed.content;
    if (parsed.username) payload.username = parsed.username;
    if (parsed.avatar_url) payload.avatar_url = parsed.avatar_url;
    if (parsed.tts) payload.tts = parsed.tts;
    if (hasEmbeds) payload.embeds = parsed.embeds;
    if (parsed.allowed_mentions) payload.allowed_mentions = parsed.allowed_mentions;
    if (parsed.thread_name) payload.thread_name = parsed.thread_name;

    // thread_idはクエリパラメータとして扱うため除去
    const { thread_id, ...restPayload } = payload;

    const result = await sendToDiscord(restPayload, !!thread_id);

    if (result.isOk()) {
      const messageInfo = result.value;
      const responseContent = {
        success: true,
        message_id: messageInfo?.id,
        channel_id: messageInfo?.channel_id,
        timestamp: messageInfo?.timestamp,
      };

      return {
        content: [
          {
            type: "text",
            text: messageInfo
              ? `メッセージを送信しました\nID: ${messageInfo.id}\nチャンネル: ${messageInfo.channel_id}`
              : "メッセージを送信しました",
          },
        ],
        structuredContent: responseContent,
        isError: false,
      };
    }

    const errorResponse = {
      content: [
        {
          type: "text",
          text: `エラー: ${formatError(result.error)}`,
        },
      ],
      structuredContent: {
        success: false,
        error: isWebhookError(result.error)
          ? {
              type: result.error.type as "webhook_error",
              status: result.error.status,
              statusText: result.error.statusText,
              message: result.error.body,
            }
          : {
              type: result.error.type,
              message: result.error.message,
            },
      },
      isError: true,
    };
    return errorResponse;
  }

  const errorResponse = {
    content: [{ type: "text", text: `エラー: 不明なツール: ${name}` }],
    structuredContent: {
      success: false,
      error: {
        type: "unknown_error",
        message: `Unknown tool: ${name}`,
      },
    },
    isError: true,
  };
  return errorResponse;
});

// ============ サーバー起動 ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
