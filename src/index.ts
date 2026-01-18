#!/usr/bin/env node
/**
 * Discord Webhook MCP Server
 *
 * Discord Webhook を使用してメッセージの送信、編集、削除を行うMCPサーバーです。
 *
 * 環境変数:
 *   - DISCORD_WEBHOOK_URL: Discord Webhook URL (必須)
 *
 * 使用例:
 *   - メッセージ送信: discord_send_message
 *   - メッセージ編集: discord_edit_message
 *   - メッセージ削除: discord_delete_message
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  type SendMessageInput,
  type EditMessageInput,
  type DeleteMessageInput,
} from "./schemas.js";
import {
  sendToDiscord,
  editDiscordMessage,
  deleteDiscordMessage,
  formatError,
} from "./discord-api.js";

// MCPサーバーインスタンスを作成
const server = new McpServer({
  name: "discord-webhook-mcp-server",
  version: "1.0.0",
});

// ============ ツール登録 ============

// メッセージ送信ツール
server.registerTool(
  "discord_send_message",
  {
    title: "Send Discord Message",
    description:
      `Discordチャンネルにメッセージを送信します。

content、embedsのいずれか最低1つが必要です。
環境変数DISCORD_WEBHOOK_URLに設定されたWebhookを使用します。

⚠️ レート制限: 30メッセージ/分/チャンネル

Args:
  - content (string, optional): メッセージ内容（1-2000文字）
  - username (string, optional): Webhookのユーザー名を上書き（最大80文字）
  - avatar_url (string, optional): Webhookのアバター画像をURLで指定
  - tts (boolean, optional): テキスト読み上げ（TTS）メッセージとして送信（デフォルト: false）
  - embeds (array, optional): Embedの配列（最大10個、合計6000文字以内）
  - allowed_mentions (object, optional): 許可されたメンション設定
  - thread_id (string, optional): 送信先スレッドID（指定したスレッドに送信、スレッドは自動アーカイブ解除）
  - thread_name (string, optional): 作成するスレッド名（フォーラム/メディアチャンネルのみで新しいスレッドを作成、最大100文字）

Returns:
  {
    "success": boolean,        // 送信が成功したか
    "message_id": string,      // 送信されたメッセージのID
    "channel_id": string,      // 送信先チャンネルID
    "timestamp": string        // 送信日時 (ISO 8601形式)
  }

Examples:
  - シンプルなテキスト送信: { "content": "Hello, Discord!" }
  - Embed付き送信: { "embeds": [{ "title": "タイトル", "description": "説明", "color": 0x00FF00 }] }
  - スレッドに送信: { "content": "スレッドメッセージ", "thread_id": "123456789" }

Error Handling:
  - "Validation error: content/embeds - content、embeds のうち最低1つを指定してください"
  - "Discord Webhook error: 400 Bad Request - Invalid webhook URL"
  - "Discord Webhook error: 404 Not Found - Webhook not found"
  - "Discord Webhook error: レート制限に達しました" - 429エラー時、retry-after秒後に再試行`,
    inputSchema: SendMessageSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: SendMessageInput) => {
    // content, embeds のうち1つが必要
    const hasContent = params.content && params.content.length > 0;
    const hasEmbeds = params.embeds && params.embeds.length > 0;

    if (!hasContent && !hasEmbeds) {
      return {
        content: [
          {
            type: "text",
            text: "エラー: content、embeds のうち最低1つを指定してください",
          },
        ],
        isError: true,
      };
    }

    // payloadの構築
    const payload: Record<string, unknown> = {};
    if (hasContent) payload.content = params.content;
    if (params.username) payload.username = params.username;
    if (params.avatar_url) payload.avatar_url = params.avatar_url;
    if (params.tts) payload.tts = params.tts;
    if (hasEmbeds) payload.embeds = params.embeds;
    if (params.allowed_mentions) payload.allowed_mentions = params.allowed_mentions;
    if (params.thread_name) payload.thread_name = params.thread_name;

    // メッセージ送信（wait=trueでメッセージIDを取得）
    const { result, error } = await sendToDiscord(
      payload,
      true,
      params.thread_id
    );

    if (error) {
      return {
        content: [
          {
            type: "text",
            text: `エラー: ${formatError(error)}`,
          },
        ],
        isError: true,
      };
    }

    const messageInfo = result;
    return {
      content: [
        {
          type: "text",
          text: messageInfo
            ? `メッセージを送信しました\nID: ${messageInfo.id}\nチャンネル: ${messageInfo.channel_id}`
            : "メッセージを送信しました",
        },
      ],
      structuredContent: {
        success: true,
        message_id: messageInfo?.id,
        channel_id: messageInfo?.channel_id,
        timestamp: messageInfo?.timestamp,
      },
    };
  }
);

// メッセージ編集ツール
server.registerTool(
  "discord_edit_message",
  {
    title: "Edit Discord Message",
    description:
      `Webhookで送信したメッセージを編集します。

content、embedsのいずれか最低1つが必要です。
環境変数DISCORD_WEBHOOK_URLに設定されたWebhookを使用します。

⚠️ レート制限: 30リクエスト/分/チャンネル

Args:
  - message_id (string, required): 編集するメッセージID
  - content (string, optional): 新しいメッセージ内容（1-2000文字）
  - embeds (array, optional): 新しいEmbedの配列（最大10個、合計6000文字以内）
  - allowed_mentions (object, optional): 許可されたメンション設定

Returns:
  {
    "success": boolean,        // 編集が成功したか
    "message_id": string,      // 編集されたメッセージのID
    "timestamp": string        // 編集日時 (ISO 8601形式)
  }

Examples:
  - テキストを編集: { "message_id": "123456789", "content": "更新後のメッセージ" }
  - Embedを編集: { "message_id": "123456789", "embeds": [{ "title": "新しいタイトル", "color": 0xFF0000 }] }

Error Handling:
  - "Validation error: content/embeds - content、embeds のうち最低1つを指定してください"
  - "Discord Webhook error: 404 Not Found - Message not found"
  - "Discord Webhook error: 400 Bad Request - Invalid message ID"
  - "Discord Webhook error: レート制限に達しました" - 429エラー時、retry-after秒後に再試行`,
    inputSchema: EditMessageSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: EditMessageInput) => {
    // content, embeds のうち1つが必要
    const hasContent = params.content && params.content.length > 0;
    const hasEmbeds = params.embeds && params.embeds.length > 0;

    if (!hasContent && !hasEmbeds) {
      return {
        content: [
          {
            type: "text",
            text: "エラー: content、embeds のうち最低1つを指定してください",
          },
        ],
        isError: true,
      };
    }

    // payloadの構築
    const payload: Record<string, unknown> = {};
    if (hasContent) payload.content = params.content;
    if (hasEmbeds) payload.embeds = params.embeds;
    if (params.allowed_mentions) payload.allowed_mentions = params.allowed_mentions;

    // メッセージ編集
    const { result, error } = await editDiscordMessage(params.message_id, payload);

    if (error || !result) {
      return {
        content: [
          {
            type: "text",
            text: error
              ? `エラー: ${formatError(error)}`
              : "エラー: メッセージの編集に失敗しました",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `メッセージを編集しました\nID: ${result.id}`,
        },
      ],
      structuredContent: {
        success: true,
        message_id: result.id,
        timestamp: result.timestamp,
      },
    };
  }
);

// メッセージ削除ツール
server.registerTool(
  "discord_delete_message",
  {
    title: "Delete Discord Message",
    description:
      `Webhookで送信したメッセージを削除します。

環境変数DISCORD_WEBHOOK_URLに設定されたWebhookを使用します。

⚠️ レート制限: 30リクエスト/分/チャンネル
⚠️ この操作は取り消せません。

Args:
  - message_id (string, required): 削除するメッセージID

Returns:
  {
    "success": boolean,        // 削除が成功したか
    "message_id": string       // 削除されたメッセージのID
  }

Examples:
  - メッセージ削除: { "message_id": "123456789" }

Error Handling:
  - "Discord Webhook error: 404 Not Found - Message not found"
  - "Discord Webhook error: 400 Bad Request - Invalid message ID"
  - "Discord Webhook error: レート制限に達しました" - 429エラー時、retry-after秒後に再試行`,
    inputSchema: DeleteMessageSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: DeleteMessageInput) => {
    // メッセージ削除
    const { error } = await deleteDiscordMessage(params.message_id);

    if (error) {
      return {
        content: [
          {
            type: "text",
            text: `エラー: ${formatError(error)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `メッセージを削除しました\nID: ${params.message_id}`,
        },
      ],
      structuredContent: {
        success: true,
        message_id: params.message_id,
      },
    };
  }
);

// ============ サーバー起動 ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Discord Webhook MCP Server running via stdio\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
