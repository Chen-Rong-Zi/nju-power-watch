# 工作流容错增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 GitHub Actions 工作流的容错能力，包括登录重试、查询条件放宽、失败自动创建 Issue

**Architecture:** 使用 `nick-fields/retry@v3` action 包装登录和 Cookie 验证步骤；放宽查询失败条件为"全失败才退出"；利用 `gh issue create` 在失败时创建 Issue

**Tech Stack:** GitHub Actions, nick-fields/retry@v3, bash

---

### Task 1: 修改 daily-query.yml — 登录和验证步骤增加 retry

**Files:**
- Modify: `.github/workflows/daily-query.yml:45-78`

- [ ] **Step 1: 将 Auto login step 改为使用 nick-fields/retry**

将原来的 `run:` 方式改为 `uses: nick-fields/retry@v3`：

```yaml
      - name: Auto login to get cookie
        id: login
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 3
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: |
            echo "${{ secrets.NJU_USERNAME }}" > /tmp/username
            echo "${{ secrets.NJU_PASSWORD }}" > /tmp/password
            echo "${{ secrets.YUNMA_TOKEN }}" > /tmp/token
            python scripts/nju_auto_login.py
            if [ ! -f "/tmp/cookie.json" ]; then
              echo "Cookie file not generated"
              exit 1
            fi
```

- [ ] **Step 2: 将 Validate cookie step 改为使用 nick-fields/retry**

```yaml
      - name: Validate cookie
        id: validate
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 2
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: python scripts/validate_cookie.py /tmp/cookie.json
```

- [ ] **Step 3: 放宽查询失败条件（line 102-104）**

将原来的 `if [ "$FAILED" -gt "$SUCCESS" ]` 改为"全失败才退出"：

```yaml
          if [ "$SUCCESS" -eq 0 ]; then
            echo "::error::All queries failed ($FAILED rooms)"
            exit 1
          elif [ "$FAILED" -gt 0 ]; then
            echo "::warning::$FAILED rooms failed, $SUCCESS succeeded — continuing with partial results"
          fi
```

- [ ] **Step 4: 增加失败时创建 Issue 的 step**

在 Summary step 之前增加：

```yaml
      - name: Create failure issue
        if: failure() && github.event_name == 'schedule'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TODAY=$(date +%Y-%m-%d)
          EXISTING=$(gh issue list \
            --label "daily-query-failure" \
            --state open \
            --json title \
            --jq '.[].title' \
            | grep -c "$TODAY" || true)
          
          if [ "$EXISTING" -eq 0 ]; then
            gh issue create \
              --title "⚠️ 每日电费查询失败 - $TODAY" \
              --label "daily-query-failure" \
              --assignee "@me" \
              --body "
          ## 查询失败详情

          - **日期**: $TODAY
          - **工作流**: ${{ github.workflow }}
          - **运行编号**: ${{ github.run_id }}
          - **触发方式**: ${{ github.event_name }}

          | 指标 | 数值 |
          |------|------|
          | 成功 | ${{ steps.query.outputs.success_count || 'N/A' }} |
          | 失败 | ${{ steps.query.outputs.failed_count || 'N/A' }} |

          [查看运行日志](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})
          "
          else
            echo "今日已有失败 Issue（$EXISTING 个），跳过创建"
          fi
```

### Task 2: 修改 daily-query.yml — Summary step 增加重试信息

**Files:**
- Modify: `.github/workflows/daily-query.yml:147-169`

- [ ] **Step 1: 在 Summary 中增加登录重试次数和失败详情**

在 Summary 的表格后增加：

```yaml
          echo "**Login Attempts**: ${{ steps.login.outputs.total_attempts }}" >> $GITHUB_STEP_SUMMARY
          if [ "$FAILED" -gt 0 ]; then
            echo "**Failed Rooms**: $FAILED" >> $GITHUB_STEP_SUMMARY
          fi
```

### Task 3: 修改 manual-query.yml

**Files:**
- Modify: `.github/workflows/manual-query.yml:48-78`

- [ ] **Step 1: 将 Auto login step 改为 retry**（与 Task 1 Step 1 相同）

```yaml
      - name: Auto login to get cookie
        id: login
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 3
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: |
            echo "${{ secrets.NJU_USERNAME }}" > /tmp/username
            echo "${{ secrets.NJU_PASSWORD }}" > /tmp/password
            echo "${{ secrets.YUNMA_TOKEN }}" > /tmp/token
            python scripts/nju_auto_login.py
            if [ ! -f "/tmp/cookie.json" ]; then
              echo "Cookie file not generated"
              exit 1
            fi
```

- [ ] **Step 2: 将 Validate cookie step 改为 retry**

```yaml
      - name: Validate cookie
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 2
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: python scripts/validate_cookie.py /tmp/cookie.json
```

### Task 4: 修改 monthly-scan-part-*.yml

**Files:**
- Modify: `.github/workflows/monthly-scan-part-1.yml`
- Modify: `.github/workflows/monthly-scan-part-2.yml`
- Modify: `.github/workflows/monthly-scan-part-3.yml`
- Modify: `.github/workflows/monthly-scan-part-4.yml`

- [ ] **Step 1: 在每个文件的 Auto login step 中增加 retry**

四个文件结构相同，将 Auto login step 改为：

```yaml
      - name: Auto login to get cookie
        id: login
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 3
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: |
            echo "${{ secrets.NJU_USERNAME }}" > /tmp/username
            echo "${{ secrets.NJU_PASSWORD }}" > /tmp/password
            echo "${{ secrets.YUNMA_TOKEN }}" > /tmp/token
            python scripts/nju_auto_login.py
            if [ ! -f "/tmp/cookie.json" ]; then
              echo "Cookie file not generated"
              exit 1
            fi
```

### Task 5: 提交所有更改

**Files:**
- `.github/workflows/daily-query.yml`
- `.github/workflows/manual-query.yml`
- `.github/workflows/monthly-scan-part-1.yml`
- `.github/workflows/monthly-scan-part-2.yml`
- `.github/workflows/monthly-scan-part-3.yml`
- `.github/workflows/monthly-scan-part-4.yml`
- `docs/superpowers/specs/2026-06-12-workflow-fault-tolerance-design.md`

- [ ] **Step 1: 提交并 push**

```bash
git add .
git commit -m "feat: enhance workflow fault tolerance with retry and failure notification

- Add nick-fields/retry@v3 to auto-login step (3 attempts, 3s interval)
- Add nick-fields/retry@v3 to validate-cookie step (3 attempts, 3s interval)
- Relax query failure condition: only fail if ALL rooms fail
- Auto-create GitHub Issue on scheduled workflow failure
- Apply same retry to manual-query and monthly-scan workflows"
```
