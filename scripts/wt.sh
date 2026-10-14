#!/usr/bin/env bash
# ワークツリー運用(並行開発ループの「分岐」と「合流」)。
#
#   scripts/wt.sh new <name> [base]  .worktrees/<name> に feat/<name> ブランチを作り依存を入れる
#   scripts/wt.sh list               一覧
#   scripts/wt.sh sync <name>        ワークツリーに main の最新を取り込む
#   scripts/wt.sh gate <name>        ワークツリーで verify → main に --no-commit でマージ → main で verify --e2e → 合格ならコミット
#   scripts/wt.sh rm <name>          ワークツリーとブランチを片付ける(マージ済みのみ)
set -euo pipefail
# main チェックアウトの場所(ワークツリーの中から呼んでも main を指す)
ROOT="$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")"
cd "$ROOT"
cmd="${1:-}"; name="${2:-}"
dir="$ROOT/.worktrees/$name"; branch="feat/$name"

need_name() { [ -n "$name" ] || { echo "usage: $0 $cmd <name>"; exit 2; }; }

case "$cmd" in
  new)
    need_name
    base="${3:-main}"
    git worktree add "$dir" -b "$branch" "$base"
    (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline --silent)
    echo "worktree: $dir  branch: $branch  (base: $base @ $(git rev-parse --short "$base"))"
    ;;
  list)
    git worktree list
    ;;
  sync)
    need_name
    (cd "$dir" && git merge --no-edit main && pnpm install --frozen-lockfile --prefer-offline --silent)
    ;;
  gate)
    need_name
    if [ -n "$(git status --porcelain)" ]; then echo "main checkout is dirty; commit or stash first"; exit 1; fi
    [ "$(git branch --show-current)" = "main" ] || { echo "main checkout must be on main"; exit 1; }
    echo "== verify in worktree ($branch)"
    (cd "$dir" && node scripts/verify.mjs) || { echo "GATE: worktree verify failed"; exit 1; }
    echo "== merge $branch into main (no commit)"
    if ! git merge --no-ff --no-commit "$branch"; then
      echo "GATE: merge conflict. Resolve in main checkout, or 'git merge --abort'"; exit 1
    fi
    # ロックファイルと食い違えば止める(合流の途中で依存の版が変わらないように)
    if ! pnpm install --frozen-lockfile --prefer-offline --silent; then
      git merge --abort
      echo "GATE: FAIL — lockfile out of date after merge; run pnpm install on the branch and commit the lockfile"; exit 1
    fi
    echo "== verify merged main (+ E2E in a real browser)"
    if node scripts/verify.mjs --e2e; then
      git commit --no-edit -m "Merge $branch" >/dev/null
      echo "GATE: PASS — merged $branch @ $(git rev-parse --short HEAD)"
    else
      git merge --abort
      echo "GATE: FAIL — merged result did not verify; merge aborted"; exit 1
    fi
    ;;
  rm)
    need_name
    git worktree remove "$dir"
    git branch -d "$branch"
    ;;
  *)
    sed -n '2,9p' "$0"; exit 2 ;;
esac
