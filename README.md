# やもんサイト

自然観察会の記録管理 Web アプリ（プロトタイプ）。招待制で、観察記録・観察会・生き物・場所をブラウザの localStorage に保存します。

## 起動

```bash
npm install
npm run dev
```

http://localhost:5173 を開きます。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 型チェック＋本番ビルド（`dist/`） |
| `npm test` | 単体テスト（Vitest） |
| `npm run typecheck` | 型チェックのみ |

> TLS 検査のあるネットワークで `npm install` が証明書エラーになる場合は、`NODE_OPTIONS=--use-system-ca` を付けて実行してください。

## 初期アカウント（デモ用）

初回起動時にデモデータが localStorage に作られます。

| 役割 | メールアドレス | パスワード |
|---|---|---|
| 管理者 | admin@example.com | admin1234 |
| 一般 | user1@example.com | user1234 |
| 一般 | user2@example.com | user1234 |

デモデータに戻したいときは、ブラウザの開発者ツールで localStorage の `yamon:db:v1` と `yamon:session` を削除して再読み込みします。

## 画面

| パス | 画面 |
|---|---|
| `/login` | ログイン・招待トークンでの新規登録（`/login?invite=<token>` で自動入力） |
| `/` | 観察記録の追加・編集・削除、観察会作成、生き物管理 |
| `/map` | 座標付き記録の地図表示（生き物・月・時間帯で絞り込み） |
| `/locations` | 主な場所ごとの生き物一覧 |
| `/event-list` | 観察会一覧と統計 |
| `/event-detail/:eventId` | 観察会内の記録管理 |
| `/admin` | 招待・ユーザー管理・管理者権限の移譲（管理者のみ） |

`/login` 以外はログインが必要です。`/admin` に一般ユーザーが入るとホームへ戻ります。

## 招待の流れ

バックエンドがないため、メールは自動送信しません。

1. 管理者が `/admin` の「招待を送る」で名前とメールアドレスを入力する
2. 招待リンク（48時間有効）が表示されるので、「リンクをコピー」または「メールアプリで送る」で相手に渡す
3. 相手がリンクを開き、ユーザー名とパスワードを設定して登録する

## 構成

```
src/
  lib/          データモデル・localStorage ストア・日時（JST）・パスワードハッシュ
  components/   共通 UI、RecordForm、EventForm、地図ピッカーなど
  pages/        各画面
docs/DECISIONS.md   技術選定・仕様の解釈とその理由
```

仕様との差分や判断の理由は [docs/DECISIONS.md](docs/DECISIONS.md) にまとめています。
