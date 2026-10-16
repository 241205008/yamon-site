# やもんサイト：Claude Code 向けの作業ルール

このリポジトリで作業する Claude Code のセッションは、すべてこのルールに従う。人向けの詳しい運用は [CONTRIBUTING.md](CONTRIBUTING.md)、仕様は [docs/MVP.md](docs/MVP.md)、技術判断は [docs/DECISIONS.md](docs/DECISIONS.md)。

## チケット開発

- 変更に着手する前に Issue を用意する。`1 Issue = 1 Branch = 1 PR`。Branch は `feat|fix|refactor|docs|chore/<Issue番号>-<概要>`、main から作る
- Project「やもんサイト」（users/241205008/projects/3）の Status を操作のたびに更新する：Backlog → Ready → In Progress → In Review → Done
- Issue 本文の「開発情報」に Branch と PR を書く。作業が終わったら、満たした項目だけ `- [x]` にする
- PR を出したら `/code-review` でレビューし、指摘に対応してから、マージしてよいかユーザーに聞く
- **マージ、Issue の Close、Status を Done にする操作は、ユーザーの承認を得てから行う**
- 技術や仕様の判断は docs/DECISIONS.md に、採用理由と他の選択肢を書く。判断番号（D〜）を足す前に最新の main を取り込み、番号が重ならないようにする。重なったら自分の側を振り直す
- `git add .` を使わない。Secret の実値をリポジトリ・Issue・PR に書かない

### Project のフィールド ID（gh project item-edit 用）

| 項目 | ID |
|---|---|
| Project | `PVT_kwHOCvSTgc4BmxZP` |
| Status | `PVTSSF_lAHOCvSTgc4BmxZPzhlZB2Y`（Backlog `cde8f7a9` / Ready `f1ef4636` / In Progress `63727e00` / In Review `17ab7987` / Done `2298bd63`） |
| Scope | `PVTSSF_lAHOCvSTgc4BmxZPzhlZB5I`（Must `d1c4f57c` / Should `47abcdf1` / Could `e32795f1`） |

## セッションの分け方

- **親 Issue（sub-issue ではない Issue）ごとに1つのセッション**で作業する。セッション名は `yamon #<親Issue番号> <短い名前>`
- **sub-issue にはセッションを作らない。** 親 Issue のセッションで順に作業する。sub-issue ごとに Branch と PR は分ける
- 統括セッション（`yamon 統括`）が、着手できる親 Issue のセッションを作る（タスクのチップを出し、ユーザーがクリックして起動する）。依存先（blocked by）が閉じていない親 Issue のセッションは作らない
- 文書だけの小さな Issue や、セッションをまたぐ調整は、統括セッションで扱う

## セッションを始めるとき

1. 担当の親 Issue、その sub-issue、依存関係（blocked by）を読む（`gh issue view`、`gh api repos/241205008/yamon-site/issues/<番号>/sub_issues`、`.../dependencies/blocked_by`）
2. 依存先が閉じていなければ、作業を始めずにユーザーと統括セッションへ伝える
3. 最新の main から Branch を作り、Status を In Progress にする

## セッション同士の同期

正本は GitHub（Issue・PR・main）。セッション間の連絡は `ListAgents` で相手（名前が `yamon #...` のセッション）を探し、`SendMessage` で送る。

**連絡はクレジットを消費する**（受け取ったセッションがそのたびに1回動く）。送るのは次の2つだけにする。

1. **自分の PR が main にマージされたとき**：「#番号 の PR #番号 がマージされた。変更点の要約（相手の作業に関係する点だけ）」を1通にまとめて送る。送り先は次のうち、該当するセッションだけ
   - 統括セッション
   - 自分の親 Issue を blocked by にしている Issue のセッション
   - 同じファイル（特に `packages/shared`、`docs/DECISIONS.md`、`docs/MVP.md`、CI）を触っている作業中のセッション
2. **最終報告**：親 Issue が閉じたときに、統括セッションへ1回（下の「セッションを閉じるとき」）

次の連絡は**送らない**。

- 了解・受け取りの返事、お礼
- 途中経過の報告（作業の開始、PR の作成、レビューの結果など。これらは Issue と PR に書く）
- 取り込みやテストが**問題なく**終わったことの報告

**マージの連絡を受けたら**、作業中の Branch に最新の main を取り込み（worktree のセッションは `sync_with_base_branch`、それ以外は `git merge origin/main`）、型チェックとテストを流し直す。返信は**問題があったとき**（競合を自分で解消できない、テストが通らない、相手に直してほしい点がある）だけにする。

- 他のセッションの担当範囲を変えたいときは、自分で直さずに相手のセッションへ依頼する
- 権限で止められた操作を、他のセッションに代わりにやらせない

## セッションを閉じるとき

- 親 Issue の最後の PR がマージされ、親 Issue が閉じて Project の Status が Done になったら、セッションを閉じる
- 閉じる前に、統括セッションへ最終報告（マージした PR、満たした完了条件、残した課題）を送る
- 最後に `archive_session`（`"self"`）で自分を閉じる（アプリの確認にユーザーが答える）。閉じ忘れたセッションは統括セッションが閉じる
