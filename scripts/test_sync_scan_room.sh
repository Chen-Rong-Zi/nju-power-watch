#!/usr/bin/env bash
# 模拟测试 scripts/sync_scan_room.sh：在临时裸仓库上构造 master/scan-room 拓扑，逐场景断言
set -euo pipefail

SYNC_SCRIPT="$(cd "$(dirname "$0")" && pwd)/sync_scan_room.sh"
if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "FAIL: sync_scan_room.sh not found（先实现它）"
  exit 1
fi

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
ORIGIN="$ROOT/origin.git"
git init --bare -q "$ORIGIN"

# 构造 origin：master=base、scan-room=base（两分支同点，均含 config + progress）
build_origin() {
  local d="$ROOT/seed"
  rm -rf "$ORIGIN"; git init --bare -q "$ORIGIN"   # 每个场景从干净 origin 开始
  rm -rf "$d"; git clone -q "$ORIGIN" "$d"
  ( cd "$d" \
    && git config user.email t@t.com && git config user.name T \
    && mkdir -p config \
    && echo '{"campus":{"b":{"r1":"101"}}}' > config/room_ids.json \
    && echo '{"cursor":100}' > scan_progress.json \
    && git add . && git commit -qm base \
    && git branch scan-room \
    && git push -q origin master scan-room )
}

# scan-room 做一次 scan 提交（推进 config + 进度）
scan_advance() {
  ( cd "$ROOT/seed" \
    && git checkout -q scan-room \
    && echo '{"campus":{"b":{"r1":"101","r2":"202"}}}' > config/room_ids.json \
    && echo '{"cursor":5462}' > scan_progress.json \
    && git add . && git commit -qm "scan: cursor 5462/150000 (cycle 1)" \
    && git push -q origin scan-room )
}

# master 工作区 = 干净的 origin/master
setup_wt() {
  rm -rf "$ROOT/wt"
  git clone -q "$ORIGIN" "$ROOT/wt"
  ( cd "$ROOT/wt" && git config user.email w@w.com && git config user.name W && git checkout -q master )
}

# 在 master 工作区运行被测脚本，捕获输出（不中止）
run_sync() { ( cd "$ROOT/wt" && bash "$SYNC_SCRIPT" 2>&1 || true ); }

PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
has() { grep -q "$2" <<< "$1"; }

echo "== 场景 1: 正常同步 =="
build_origin; scan_advance; setup_wt
OUT=$(run_sync)
has "$OUT" "Pushed config" && ok "正常路径推送成功" || bad "正常路径推送成功 (out: $OUT)"
has "$OUT" "cursor 5462" && ok "提交信息含 cursor 5462" || bad "提交信息含 cursor 5462"
( cd "$ROOT/wt" \
  && diff <(git show HEAD:config/room_ids.json) <(git show origin/scan-room:config/room_ids.json) >/dev/null \
     && ok "master config == scan-room config" || bad "master config == scan-room config" \
  && diff <(git show HEAD:scan_progress.json) <(git show origin/scan-room:scan_progress.json) >/dev/null \
     && ok "master progress == scan-room progress" || bad "master progress == scan-room progress" \
  && git log --oneline -1 | grep -q "scan: sync" && ok "提交为普通提交" || bad "提交为普通提交" )

echo "== 场景 2: scan-room 分支不存在 =="
build_origin
git -C "$ORIGIN" branch -D scan-room >/dev/null
setup_wt
OUT=$(run_sync)
has "$OUT" "Failed to fetch scan-room" && ok "跳过提示" || bad "跳过提示 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git rev-list --count HEAD)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 3: scan_progress.json 在 scan-room 缺失 =="
build_origin
( cd "$ROOT/seed" \
  && git checkout -q scan-room \
  && git rm -q scan_progress.json && git commit -qm "rm progress" \
  && git push -q origin scan-room )
setup_wt
OUT=$(run_sync)
has "$OUT" "missing on scan-room" && ok "预检跳过" || bad "预检跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git rev-list --count HEAD)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 4: 摘取内容为坏 JSON =="
build_origin
( cd "$ROOT/seed" \
  && git checkout -q scan-room \
  && echo '{bad json' > config/room_ids.json && git commit -qam "bad json" \
  && git push -q origin scan-room )
setup_wt
OUT=$(run_sync)
has "$OUT" "Invalid JSON" && ok "JSON 校验跳过" || bad "JSON 校验跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git rev-list --count HEAD)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 5: 无变化（幂等）=="
build_origin
setup_wt
OUT=$(run_sync)
has "$OUT" "No changes" && ok "幂等跳过" || bad "幂等跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git rev-list --count HEAD)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 6: push 失败回滚 =="
build_origin; scan_advance; setup_wt
# 制造并发：setup_wt 之后 origin/master 被外部推进（wt 不知道）
( cd "$ROOT/seed" \
  && git checkout -q master && git pull -q origin master \
  && echo x > README && git add . && git commit -qm "concurrent master advance" \
  && git push -q origin master )
OUT=$(run_sync)
has "$OUT" "Failed to push" && ok "push 失败被捕获" || bad "push 失败被捕获 (out: $OUT)"
( cd "$ROOT/wt" \
  && [ "$(git rev-list --count HEAD)" = 1 ] && ok "本地回滚到 pre-sync master" || bad "本地回滚 (HEAD: $(git log --oneline -1))" \
  && [ -z "$(git status --porcelain)" ] && ok "工作树干净" || bad "工作树干净" )

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] || exit 1