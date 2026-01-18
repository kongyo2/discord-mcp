# Discord Webhook MCP

Discord Webhook を使用してメッセージの送信、編集、削除を行う [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーです。

## 特徴

- **メッセージ送信** - テキスト、Embed、スレッド対応
- **メッセージ編集** - 送信済みメッセージの内容を更新
- **メッセージ削除** - 送信済みメッセージを削除
- **Zod バリデーション** - 入力パラメータの厳密な検証

## 使用方法

### MCP設定

MCP対応クライアント（例: Gemini CLI）の設定ファイルに以下を追加:

```json
{
  "mcpServers": {
    "discord-mcp": {
      "command": "npx",
      "args": ["-y", "@kongyo2/discord-webhook-mcp"],
      "env": {
        "DISCORD_WEBHOOK_URL": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
      }
    }
  }
}
```

### 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DISCORD_WEBHOOK_URL` | ✅ | Discord Webhook URL |

## ツール一覧

### `discord_send_message`

メッセージを送信します。

```json
{
  "content": "Hello, Discord!",
  "embeds": [
    {
      "title": "タイトル",
      "description": "説明文",
      "color": 65280
    }
  ]
}
```

### `discord_edit_message`

送信済みメッセージを編集します。

```json
{
  "message_id": "123456789",
  "content": "更新後のメッセージ"
}
```

### `discord_delete_message`

送信済みメッセージを削除します。

```json
{
  "message_id": "123456789"
}
```

## 制限事項

- レート制限: 30メッセージ/分/チャンネル
- メッセージ本文: 最大2000文字
- Embed: 最大10個、合計6000文字以内

## 開発

```bash
# 依存関係のインストール
npm install

# 開発モード
npm run dev

# ビルド
npm run build

# Lint
npm run lint
```

## ライセンス

MIT
