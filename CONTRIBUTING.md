# Contributing

やもんサイトはチケット（GitHub Issue）単位で開発します。運用は [JOGI HACK 2026 の CONTRIBUTING](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/main/CONTRIBUTING.md) に合わせ、個人開発に合わない部分だけ変えています（[JOGI HACK 2026 から変えた点](#jogi-hack-2026-から変えた点)）。

## 開発フロー

1. 対応する既存Issueを探し、なければ変更に着手する前にIssueを作る
2. Issueの目的・やること・完了条件を確認する
3. 自分をAssigneeに設定し、Project「やもんサイト」のScopeを設定する
4. Statusを `Ready` にする
5. 最新の `main` から作業Branchを作る
6. Issue本文の「開発情報」にBranch名を書き、Statusを `In Progress` にする
7. 実装・動作確認をする
8. 差分を確認してCommitし、Pushする
9. Pull Requestを作る。全て解決するIssueは `Closes #<番号>`、一部対応・参考は `Refs #<番号>` と書く
10. Issue本文の「開発情報」にPRを書き、Statusを `In Review` にする
11. コードレビューを受け、指摘に対応する
12. CIが成功したらSquash Mergeする
13. IssueがCloseされ、Statusが `Done` になったことを確認する
14. Merge済みの作業Branchを削除する

各操作を終えた時点でProjectのStatusも更新し、実装中・レビュー待ち・Merge済みを同じStatusのまま放置しません。

## Branch

`main` はレビュー済みの変更だけが入るBranchです。`main` へ直接pushせず、必ずPull Request経由で入れます。

原則として `1 Issue = 1 Branch = 1 Pull Request` です。無関係なIssueを同じBranchで扱いません。

| 形式 | 用途 |
| --- | --- |
| `feat/<Issue番号>-<概要>` | 新機能・機能追加 |
| `fix/<Issue番号>-<概要>` | バグ修正 |
| `refactor/<Issue番号>-<概要>` | 外部の動作を変えない内部改善 |
| `docs/<Issue番号>-<概要>` | ドキュメント |
| `chore/<Issue番号>-<概要>` | 開発環境・設定・依存関係など |

例：`feat/12-password-reset`、`fix/23-map-picker`

## Issue

実装・修正・設定変更・ドキュメント更新は、小さな変更でも着手前にIssueへ紐付けます。

テンプレートは4種類あり、それぞれ同名のラベルが付きます。

| 種類 | 使うとき |
| --- | --- |
| Feature | 新しい機能、既存機能の拡張 |
| Bug | 想定どおりに動かない不具合 |
| Task | ドキュメント、CI、開発環境、リファクタリングなど |
| Investigation | 判断材料を集める調査。「何を判断するための調査か」を明確にする |

完了条件は、どこまでできれば完了かが分かる形で書きます。

- 悪い例：`検索機能を作る`
- 良い例：`- [ ] キーワードを入力できる` `- [ ] 結果が0件のときの表示がある`

### 開発情報

Issue本文の末尾に、BranchとPull Requestを記録します。

    ## 開発情報

    - Branch: [feat/12-search](https://github.com/241205008/yamon-site/tree/feat/12-search)
    - Pull Request: #18

まだ作っていないものは「未作成」とし、存在しないリンクを書きません。

## Project（Status / Scope）

Project「やもんサイト」（https://github.com/users/241205008/projects/3）で管理します。

    Backlog → Ready → In Progress → In Review → Done

| タイミング | Status |
| --- | --- |
| Issueを作ったが、まだ着手条件を満たしていない | Backlog |
| 目的・完了条件・Assignee・Scopeが決まり、着手できる | Ready |
| Branchを作って作業を始めた | In Progress |
| PRを作ってレビューを依頼した | In Review |
| レビューで修正が必要になった | In Progress |
| PRが `main` へMergeされ、IssueがCloseされた | Done |

Scopeは完成の優先範囲です。Mustの完成度を犠牲にしてShould・Couldに取り組みません。

| Scope | 意味 |
| --- | --- |
| Must | 必ず完成させる |
| Should | Mustの完成後に取り組む |
| Could | 余力がある場合のみ取り組む |

## Definition of Ready

- [ ] 目的・背景が分かる
- [ ] やることが分かる
- [ ] 完了条件が分かる
- [ ] Scopeが設定されている
- [ ] Assigneeが設定されている
- [ ] 大きすぎるIssueになっていない
- [ ] 前提作業が完了している

## Commit

`git add .` で確認せずに全変更をStageしません。変更したファイルを確認し、必要なものだけStageして `git diff --staged` で確かめます。1つのCommitに無関係な変更を混ぜません。

メッセージの例：`feat: パスワード再設定を追加`、`fix: 地図ピッカーの座標ずれを修正`、`docs: READMEを更新`、`chore: CIを追加`

## Pull Request

- 対応Issueと紐付ける
- PRテンプレートの項目を埋める（何を・なぜ・どう確認したか・未確認事項）
- UI変更はスクリーンショットを載せる（可能ならBefore / After）
- 無関係な変更を同じPRに入れない
- Merge方式はSquash Merge

### レビューとセルフマージ

個人開発のため、別メンバーのApproveは求めません。代わりに、次をすべて満たしたときだけ自分でSquash Mergeします。

- [ ] コードレビューをした。Claude Code の `/code-review` などで不具合を探し、指摘に対応するか、対応しない理由をPRに書いた
- [ ] 正常系だけでなく、変更に関係する壊れ方（未入力、権限なし、日付の切り替わり、再読み込みなど）も確かめた
- [ ] 最新コミットのCI（Typecheck / Test / Build）が成功し、競合がない
- [ ] PRに「確認した内容・結果・未確認事項」を書いた
- [ ] 未解決の重大な問題が残っていない

## ドキュメントと技術判断

| 情報 | 置き場所 |
| --- | --- |
| 使い方・起動方法・画面一覧 | [README.md](README.md) |
| 技術選定・仕様の解釈とその理由 | [docs/DECISIONS.md](docs/DECISIONS.md) |
| 作業の経緯・細かな判断 | 各Issue / PR |

技術選定や仕様の解釈を変えたときは、同じPRで `docs/DECISIONS.md` を更新し、**採択した理由と、他の選択肢がどうだったか**を書きます。判断を置き換えるときは、古い項目を消さずに「置き換え済み」と新しい項目へのリンクを残します。

## Definition of Done

- [ ] Issueの完了条件を満たしている
- [ ] 必要な動作確認が完了し、未確認事項を記録した
- [ ] 必要な文書を更新した（不要なら理由をPRに書いた）
- [ ] コードレビューが完了し、未解決の指摘がない
- [ ] CIが成功している
- [ ] `main` へSquash Mergeされている
- [ ] IssueがCloseされ、ProjectのStatusが `Done` になっている

「実装が終わった」だけではDoneではありません。

## 秘密情報

APIキー、アクセストークン、パスワード、`.env` の実値などはCommitしません。README のデモ用アカウントは、localStorage だけで動くデモデータ用のもので、秘密情報ではありません。

## JOGI HACK 2026 から変えた点

| 項目 | JOGI HACK 2026 | やもんサイト | 理由 |
| --- | --- | --- | --- |
| Issueの種類 | GitHubのIssue Type（Organization機能） | ラベル（feature / bug / task / investigation） | 個人リポジトリではIssue Typeを使えないため。ラベルなら一覧で絞り込める |
| レビュー | 別メンバーのApprove必須（条件付きセルフマージあり） | 条件付きセルフマージのみ。`/code-review` などのコードレビューを必須にする | 開発者が1人で、Approveできる人がいないため。レビュー自体は省かない |
| 仕様の正本 | `docs/product-spec.md` と `docs/architecture.md` の2本＋Decision Log | `README.md` と `docs/DECISIONS.md` | 規模が小さく、文書を分けると更新漏れの方が問題になるため。規模が大きくなったら分割を検討する |
| CI | Foundation（文書・設定の検査）＋アプリ別 | 型チェック・テスト・ビルドの1本 | アプリが1つだけのため |
