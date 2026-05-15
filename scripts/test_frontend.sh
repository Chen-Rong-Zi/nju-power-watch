#!/bin/bash
# Quick test script for frontend validation

echo "======================================="
echo "NJU Electricity Frontend Test"
echo "======================================="
echo ""

# Check if docs directory exists
if [ ! -d "docs" ]; then
    echo "❌ Error: docs/ directory not found"
    exit 1
fi

# Check if database directory exists
if [ ! -d "database" ]; then
    echo "❌ Error: database/ directory not found"
    exit 1
fi

# Check required files
echo "Checking required files..."
FILES_OK=true

for file in "docs/index.html" "docs/css/style.css" "docs/js/app.js"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (missing)"
        FILES_OK=false
    fi
done

if [ "$FILES_OK" = false ]; then
    exit 1
fi

# Check data files
echo ""
echo "Checking data files..."

if [ -f "docs/data/index.json" ]; then
    SIZE=$(stat -f%z "docs/data/index.json" 2>/dev/null || stat -c%s "docs/data/index.json" 2>/dev/null)
    echo "  ✅ data/index.json ($SIZE bytes)"
else
    echo "  ❌ data/index.json (missing)"
    echo ""
    echo "Run: python scripts/generate_index.py"
    exit 1
fi

CAMPUS_COUNT=$(ls -1 docs/data/campus_*.json 2>/dev/null | wc -l)
if [ "$CAMPUS_COUNT" -gt 0 ]; then
    echo "  ✅ Found $CAMPUS_COUNT campus data files"
else
    echo "  ❌ No campus data files found"
    echo ""
    echo "Run: python scripts/generate_index.py"
    exit 1
fi

# Check symlink
echo ""
echo "Checking database symlink..."

if [ -L "docs/database" ]; then
    echo "  ✅ docs/database -> ../database (symlink exists)"
elif [ -d "docs/database" ]; then
    echo "  ✅ docs/database (directory exists)"
else
    echo "  ⚠️  docs/database not found, creating symlink..."
    cd docs && ln -s ../database database && cd ..
    echo "  ✅ Symlink created"
fi

# Test sample data access
echo ""
echo "Testing data access..."

SAMPLE_ROOM=$(find database -name "*.json" -type f | head -1)
if [ -n "$SAMPLE_ROOM" ]; then
    echo "  ✅ Found sample data: $SAMPLE_ROOM"
    
    # Try to read it
    if command -v jq &> /dev/null; then
        ROOM_INFO=$(cat "$SAMPLE_ROOM" | jq -r '.校区, .楼栋, .房间' 2>/dev/null)
        if [ -n "$ROOM_INFO" ]; then
            echo "     Campus: $(echo "$ROOM_INFO" | head -1)"
            echo "     Building: $(echo "$ROOM_INFO" | head -2 | tail -1)"
            echo "     Room: $(echo "$ROOM_INFO" | tail -1)"
        fi
    fi
else
    echo "  ⚠️  No data files found in database/"
fi

# Port check
echo ""
echo "Checking for running server..."

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ✅ Server already running on port 8000"
    echo ""
    echo "Open in browser: http://localhost:8000"
else
    echo "  ℹ️  No server running on port 8000"
    echo ""
    echo "Start server with:"
    echo "  python scripts/serve_docs.py"
    echo ""
    echo "Or manually:"
    echo "  cd docs && python -m http.server 8000"
fi

# Summary
echo ""
echo "======================================="
echo "Test Complete"
echo "======================================="
echo ""
echo "Next steps:"
echo "1. Start local server: python scripts/serve_docs.py"
echo "2. Open browser: http://localhost:8000"
echo "3. Test room search and chart display"
echo "4. For GitHub Pages: push to main branch"
echo ""
