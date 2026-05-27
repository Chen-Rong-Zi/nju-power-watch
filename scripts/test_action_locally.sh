#!/usr/bin/env bash
#
# 本地测试 GitHub Actions 工作流的脚本
# 模拟 CI 环境执行完整的查询流程
#
# 用法:
#   ./scripts/test_action_locally.sh              # 完整流程
#   ./scripts/test_action_locally.sh --skip-login # 跳过登录
#   ./scripts/test_action_locally.sh --dry-run    # 预览步骤
#   ./scripts/test_action_locally.sh --room-ids "42133 53463"  # 指定房间
#

set -e

# ========================================
# 辅助函数（必须在使用前定义）
# ========================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STEP_START=0

step_start() {
    local step_name="$1"
    echo ""
    echo -e "${YELLOW}▶ Step: $step_name${NC}"
    echo "" >> "$GITHUB_STEP_SUMMARY"
    echo "### $step_name" >> "$GITHUB_STEP_SUMMARY"
    STEP_START=$(date +%s)
}

step_end() {
    local step_name="$1"
    local step_end=$(date +%s)
    local duration=$((step_end - STEP_START))
    echo -e "${GREEN}✓ $step_name 完成 (${duration}s)${NC}"
    echo "" >> "$GITHUB_STEP_SUMMARY"
    echo "✓ Completed in ${duration}s" >> "$GITHUB_STEP_SUMMARY"
}

# ========================================
# 默认配置
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATABASE_DIR="$PROJECT_ROOT/database"
COOKIE_FILE="/tmp/cookie.json"
SKIP_LOGIN=false
DRY_RUN=false
ROOM_IDS=""

# 模拟 GitHub Actions 环境变量
export GITHUB_WORKFLOW="local-test"
export GITHUB_RUN_ID="local-$(date +%s)"
export GITHUB_STEP_SUMMARY="/tmp/github_step_summary.md"

# ========================================
# 解析参数
# ========================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-login)
            SKIP_LOGIN=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --room-ids)
            ROOM_IDS="$2"
            shift 2
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --skip-login       跳过自动登录，使用现有 cookie"
            echo "  --dry-run          仅显示将要执行的步骤，不实际执行"
            echo "  --room-ids IDS     指定要查询的房间 ID（空格分隔）"
            echo "  --help, -h         显示此帮助信息"
            echo ""
            echo "环境变量:"
            echo "  NJU_USERNAME       南京大学统一认证用户名"
            echo "  NJU_PASSWORD       南京大学统一认证密码"
            echo "  YUNMA_TOKEN        云码 token"
            exit 0
            ;;
        *)
            echo -e "${RED}未知参数: $1${NC}"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# ========================================
# 主流程
# ========================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  本地测试 GitHub Actions 工作流${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 初始化步骤摘要
echo "# 📊 Local Action Test Summary" > "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "**Started at**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"

cd "$PROJECT_ROOT"

# ----------------------------------------
# Step 1: 设置 Python 环境
# ----------------------------------------
step_start "Set up Python"
echo "Python 版本: $(python3 --version)"

if [ -d ".venv" ]; then
    echo "✓ 虚拟环境已存在"
else
    echo "创建虚拟环境..."
    python3 -m venv .venv
fi

source .venv/bin/activate
step_end "Set up Python"

# ----------------------------------------
# Step 2: 安装依赖
# ----------------------------------------
step_start "Install dependencies"
if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将安装 requirements.txt 中的依赖"
else
    python -m pip install --upgrade pip -q
    pip install -r requirements.txt -q
    echo "✓ 依赖安装完成"
fi
step_end "Install dependencies"

# ----------------------------------------
# Step 3: 自动登录获取 Cookie
# ----------------------------------------
step_start "Auto login to get cookie"

if [ "$SKIP_LOGIN" = true ]; then
    echo "⚠️  跳过自动登录"
    if [ -f "$COOKIE_FILE" ]; then
        echo "✓ 使用现有 Cookie: $COOKIE_FILE"
    else
        echo -e "${RED}✗ Cookie 文件不存在: $COOKIE_FILE${NC}"
        echo "请先运行一次不带 --skip-login 的测试，或手动创建 Cookie 文件"
        exit 1
    fi
elif [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将执行自动登录流程"
else
    # 检查必需的环境变量
    if [ -z "$NJU_USERNAME" ] || [ -z "$NJU_PASSWORD" ] || [ -z "$YUNMA_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  未设置登录凭据环境变量${NC}"
        echo "请设置以下环境变量:"
        echo "  export NJU_USERNAME='your_username'"
        echo "  export NJU_PASSWORD='your_password'"
        echo "  export YUNMA_TOKEN='your_token'"
        echo ""
        echo "或者使用 --skip-login 跳过登录步骤"

        # 检查是否有现有的 cookie
        if [ -f "$COOKIE_FILE" ]; then
            echo -e "${GREEN}✓ 发现现有 Cookie 文件: $COOKIE_FILE${NC}"
            echo "将使用现有 Cookie 继续测试"
        else
            exit 1
        fi
    else
        echo "写入配置文件..."
        echo "$NJU_USERNAME" > /tmp/username
        echo "$NJU_PASSWORD" > /tmp/password
        echo "$YUNMA_TOKEN" > /tmp/token

        echo "执行自动登录..."
        python scripts/nju_auto_login.py

        if [ -f "$COOKIE_FILE" ]; then
            echo -e "${GREEN}✓ Cookie 文件已生成: $COOKIE_FILE${NC}"
        else
            echo -e "${RED}✗ Cookie 文件生成失败${NC}"
            exit 1
        fi
    fi
fi
step_end "Auto login to get cookie"

# ----------------------------------------
# Step 4: 验证 Cookie
# ----------------------------------------
step_start "Validate cookie"
if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将验证 Cookie"
else
    python scripts/validate_cookie.py "$COOKIE_FILE"
    echo -e "${GREEN}✓ Cookie 验证通过${NC}"
fi
step_end "Validate cookie"

# ----------------------------------------
# Step 5: 读取房间 ID
# ----------------------------------------
step_start "Read room IDs"
if [ -n "$ROOM_IDS" ]; then
    echo "使用命令行指定的房间 ID: $ROOM_IDS"
else
    if [ -f "config/room_ids.txt" ]; then
        ROOM_IDS=$(cat config/room_ids.txt | grep -v '^#' | grep -v '^$' | tr '\n' ' ')
        echo "从 config/room_ids.txt 读取房间 ID"
        echo "房间数量: $(echo "$ROOM_IDS" | wc -w | tr -d ' ')"
    else
        echo -e "${RED}✗ 未找到 config/room_ids.txt${NC}"
        exit 1
    fi
fi
step_end "Read room IDs"

# ----------------------------------------
# Step 6: 查询电费数据
# ----------------------------------------
step_start "Query electricity data"
if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将执行查询命令"
    echo "  python nju_electric_query.py --cookie-file $COOKIE_FILE -d ./database -c 200 -q \$ROOM_IDS"
else
    python nju_electric_query.py \
        --cookie-file "$COOKIE_FILE" \
        -d ./database \
        -c 200 \
        -q \
        $ROOM_IDS \
        2>&1 | tee /tmp/query_output.log

    # 提取统计信息（兼容 macOS 和 Linux）
    SUCCESS=$(grep '成功:' /tmp/query_output.log | tail -1 | sed 's/.*成功: \([0-9]*\).*/\1/' || echo "0")
    FAILED=$(grep '失败:' /tmp/query_output.log | tail -1 | sed 's/.*失败: \([0-9]*\).*/\1/' || echo "0")

    echo ""
    echo -e "${GREEN}✓ 查询完成${NC}"
    echo "  成功: $SUCCESS"
    echo "  失败: $FAILED"

    # 记录到摘要
    echo "" >> "$GITHUB_STEP_SUMMARY"
    echo "| Metric | Count |" >> "$GITHUB_STEP_SUMMARY"
    echo "|--------|-------|" >> "$GITHUB_STEP_SUMMARY"
    echo "| ✅ Success | $SUCCESS |" >> "$GITHUB_STEP_SUMMARY"
    echo "| ❌ Failed | $FAILED |" >> "$GITHUB_STEP_SUMMARY"
fi
step_end "Query electricity data"

# ----------------------------------------
# Step 7: 生成汇总数据
# ----------------------------------------
step_start "Generate hierarchical summaries"
if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将生成汇总数据"
else
    python scripts/aggregate_data.py \
        --database ./database \
        --output ./database/summaries
    echo -e "${GREEN}✓ 汇总数据生成完成${NC}"
fi
step_end "Generate hierarchical summaries"

# ----------------------------------------
# Step 8: 生成楼栋详情
# ----------------------------------------
step_start "Generate building details"
if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] 将生成楼栋详情"
else
    python scripts/generate_building_details.py \
        --summaries ./database/summaries
    echo -e "${GREEN}✓ 楼栋详情生成完成${NC}"
fi
step_end "Generate building details"

# ========================================
# 最终摘要
# ========================================

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  测试完成${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo "**Finished at**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "**Status**: ✅ All steps completed successfully" >> "$GITHUB_STEP_SUMMARY"

echo "步骤摘要已保存到: $GITHUB_STEP_SUMMARY"
echo ""
cat "$GITHUB_STEP_SUMMARY"
