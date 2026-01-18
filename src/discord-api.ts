/**
 * Discord Webhook API クライアント
 */

import type {
  DiscordMessageResponse,
  DiscordWebhookError,
  Embed,
  AllowedMentions,
} from "./types.js";

// 環境変数からWebhook URLを取得
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  process.stderr.write("DISCORD_WEBHOOK_URL environment variable is not set\n");
  process.stderr.write("Please set DISCORD_WEBHOOK_URL before running this server\n");
  process.exit(1);
}

// 型ガード関数
export function isWebhookError(
  error: DiscordWebhookError
): error is Extract<DiscordWebhookError, { type: "webhook_error" }> {
  return error.type === "webhook_error";
}

// エラーメッセージを整形
export function formatError(error: DiscordWebhookError): string {
  switch (error.type) {
    case "webhook_error":
      return `Discord Webhook error: ${error.status} ${error.statusText}\n${error.body}`;
    case "validation_error":
      return `Validation error: ${error.field} - ${error.message}`;
    case "unknown_error":
      return `Unknown error: ${error.message}`;
  }
}

// APIリクエスト用のヘルパー関数
async function makeRequest<T>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

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

  // DELETE の場合はレスポンスボディがない場合がある
  if (method === "DELETE") {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// エラーを変換
function convertError(error: unknown): DiscordWebhookError {
  if (error instanceof Error && error.message.startsWith("{")) {
    try {
      const parsed = JSON.parse(error.message);
      return {
        type: "webhook_error",
        status: parsed.status,
        statusText: parsed.statusText,
        body: parsed.body,
      };
    } catch {
      return {
        type: "unknown_error",
        message: error.message,
      };
    }
  }
  return {
    type: "unknown_error",
    message: error instanceof Error ? error.message : String(error),
  };
}

// メッセージを送信
export async function sendToDiscord(
  payload: {
    content?: string;
    username?: string;
    avatar_url?: string;
    tts?: boolean;
    embeds?: Embed[];
    allowed_mentions?: AllowedMentions;
    thread_name?: string;
  },
  wait: boolean = true,
  threadId?: string
): Promise<{ result: DiscordMessageResponse | null; error?: DiscordWebhookError }> {
  const url = new URL(WEBHOOK_URL!);
  if (wait) url.searchParams.set("wait", "true");
  if (threadId) url.searchParams.set("thread_id", threadId);

  try {
    const result = await makeRequest<DiscordMessageResponse | null>(
      url.toString(),
      "POST",
      payload
    );
    return { result };
  } catch (error) {
    return { result: null, error: convertError(error) };
  }
}

// メッセージを編集
export async function editDiscordMessage(
  messageId: string,
  payload: {
    content?: string;
    embeds?: Embed[];
    allowed_mentions?: AllowedMentions;
  }
): Promise<{ result: DiscordMessageResponse; error?: DiscordWebhookError }> {
  const url = new URL(`${WEBHOOK_URL!}/messages/${messageId}`);

  try {
    const result = await makeRequest<DiscordMessageResponse>(url.toString(), "PATCH", payload);
    return { result };
  } catch (error) {
    return { result: null as any, error: convertError(error) };
  }
}

// メッセージを削除
export async function deleteDiscordMessage(
  messageId: string
): Promise<{ error?: DiscordWebhookError }> {
  const url = new URL(`${WEBHOOK_URL!}/messages/${messageId}`);

  try {
    await makeRequest<void>(url.toString(), "DELETE");
    return {};
  } catch (error) {
    return { error: convertError(error) };
  }
}
