#!/bin/bash
# Quick test script for frontend validation (NEW DATA STRUCTURE)

echo "======================================="
echo "NJU Electricity Frontend Test"
echo "  (Hierarchical Aggregation Structure)"
echo "======================================="
echo ""

# Check if docs directory exists
if [ ! -d "docs" ]; then
    echo "❌ Error: docs/ directory not found"
    exit 1
fi

# Check if database/summaries directory exists
if [ ! -d "database/summaries" ]; then
    echo "❌ Error: database/summaries/ directory not found"
    echo ""
    echo "Run: python scripts/aggregate_data.py"
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

# Check summary files
echo ""
echo "Checking summary data files..."

if [ -f "database/summaries/overview.json" ]; then
    SIZE=$(stat -f%z "database/summaries/overview.json" 2>/dev/null || stat -c%s "database/summaries/overview.json" 2>/dev/null)
    echo "  ✅ overview.json ($SIZE bytes)"
    
    # Show summary stats
    if command -v jq &> /dev/null; then
        TOTAL_ROOMS=$(cat "database/summaries/overview.json" | jq -r '.total_rooms')
        CAMPUS_COUNT=$(cat "database/summaries/overview.json" | jq -r '.campuses | keys | length')
        echo "     → $TOTAL_ROOMS rooms across $CAMPUS_COUNT campuses"
    fi
else
    echo "  ❌ overview.json (missing)"
    echo ""
    echo "Run: python scripts/aggregate_data.py"
    exit 1
fi

# Check campus directories
CAMPUS_COUNT=$(find database/summaries/campuses -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
if [ "$CAMPUS_COUNT" -gt 0 ]; then
    echo "  ✅ Found $CAMPUS_COUNT campus summary directories"
else
    echo "  ❌ No campus summary directories found"
    echo ""
    echo "Run: python scripts/aggregate_data.py"
    exit 1
fi

# Test sample data access
echo ""
echo "Testing sample data access..."

SAMPLE_CAMPUS=$(find database/summaries/campuses -mindepth 1 -maxdepth 1 -type d | head -1 | xargs basename)
if [ -n "$SAMPLE_CAMPUS" ]; then
    echo "  ✅ Sample campus: $SAMPLE_CAMPUS"
    
    # Check campus summary
    CAMPUS_SUMMARY="database/summaries/campuses/$SAMPLE_CAMPUS/summary.json"
    if [ -f "$CAMPUS_SUMMARY" ]; then
        echo "  ✅ Campus summary exists"
        
        if command -v jq &> /dev/null; then
            BUILDING_COUNT=$(cat "$CAMPUS_SUMMARY" | jq -r '.buildings | keys | length')
            ROOM_COUNT=$(cat "$CAMPUS_SUMMARY" | jq -r '.total_rooms')
            echo "     → $BUILDING_COUNT buildings, $ROOM_COUNT rooms"
        fi
    fi
    
    # Check sample building
    SAMPLE_BUILDING=$(find "database/summaries/campuses/$SAMPLE_CAMPUS/buildings" -mindepth 1 -maxdepth 1 -type d | head -1 | xargs basename)
    if [ -n "$SAMPLE_BUILDING" ]; then
        echo "  ✅ Sample building: $SAMPLE_BUILDING"
        
        # Check building summary
        BUILDING_SUMMARY="database/summaries/campuses/$SAMPLE_CAMPUS/buildings/$SAMPLE_BUILDING/summary.json"
        if [ -f "$BUILDING_SUMMARY" ]; then
            echo "  ✅ Building summary exists"
            
            # Check sample room
            SAMPLE_ROOM=$(find "database/summaries/campuses/$SAMPLE_CAMPUS/buildings/$SAMPLE_BUILDING/rooms" -name "*.json" | head -1)
            if [ -n "$SAMPLE_ROOM" ]; then
                ROOM_ID=$(basename "$SAMPLE_ROOM" .json)
                echo "  ✅ Sample room: $ROOM_ID"
                
                if command -v jq &> /dev/null; then
                    ROOM_NAME=$(cat "$SAMPLE_ROOM" | jq -r '.room_name')
                    CURRENT_BALANCE=$(cat "$SAMPLE_ROOM" | jq -r '.current_balance')
                    HISTORY_DAYS=$(cat "$SAMPLE_ROOM" | jq -r '.balance_history | keys | length')
                    echo "     → $ROOM_NAME: ${CURRENT_BALANCE}度 ($HISTORY_DAYS days history)"
                fi
            fi
        fi
    fi
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
echo "Data structure: hierarchical aggregation"
echo "  - database/summaries/overview.json"
echo "  - database/summaries/campuses/{campus}/summary.json"
echo "  - database/summaries/campuses/{campus}/buildings/{building}/summary.json"
echo "  - database/summaries/campuses/{campus}/buildings/{building}/rooms/{id}.json"
echo ""
echo "Key features:"
echo "  ✅ Complete balance history in each room file"
echo "  ✅ Frontend calculates statistics dynamically"
echo "  ✅ Predictive analysis possible with full history"
echo ""
echo "Next steps:"
echo "1. Start local server: python scripts/serve_docs.py"
echo "2. Open browser: http://localhost:8000"
echo "3. Test room search and chart display"
echo "4. For GitHub Pages: push to main branch"
echo ""
