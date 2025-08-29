#!/bin/bash

# Direct Processing Test Runner (Bypasses Database)
# Run this script from the oxkair-shell directory

set -e

echo "🚀 Direct Medical Note Processing Test (Database Bypass)"
echo "========================================================"

# Check if we're in the oxkair-shell directory
if [ ! -f "package.json" ] || [ ! -d "app" ]; then
    echo "❌ Error: Please run this script from the oxkair-shell directory"
    echo "   Expected to find package.json and app/ directory"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Function to run inline test
run_inline_direct_test() {
    echo "🚀 Running inline direct test (bypassing database)..."
    npx tsx tmp_rovodev_bypass_db_test.ts --inline
}

# Function to run test with sample files
run_sample_direct_test() {
    echo "🚀 Running direct test with sample operative note..."
    npx tsx tmp_rovodev_bypass_db_test.ts --note=tmp_rovodev_sample_operative_note.md --config=tmp_rovodev_sample_config.json
}

# Function to run test with simple config
run_simple_direct_test() {
    echo "🚀 Running direct test with simple configuration..."
    npx tsx tmp_rovodev_bypass_db_test.ts --note=tmp_rovodev_sample_operative_note.md --config=tmp_rovodev_simple_test_config.json
}

# Function to run custom test
run_custom_direct_test() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "❌ Error: Please provide note file and config file"
        echo "   Usage: $0 custom <note-file> <config-file>"
        exit 1
    fi
    
    echo "🚀 Running direct test with custom files..."
    echo "   Note: $1"
    echo "   Config: $2"
    npx tsx tmp_rovodev_bypass_db_test.ts --note="$1" --config="$2"
}

# Function to show help
show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  inline     Run quick direct test with built-in sample data"
    echo "  sample     Run direct test with sample operative note and full config"
    echo "  simple     Run direct test with sample note and minimal config"
    echo "  custom <note-file> <config-file>  Run direct test with your own files"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 inline"
    echo "  $0 sample"
    echo "  $0 simple"
    echo "  $0 custom my-note.md my-config.json"
    echo ""
    echo "This version bypasses database operations and directly processes notes."
    echo "Perfect for testing the orchestrator pipeline without database setup."
    echo ""
    echo "Sample files available:"
    echo "  - tmp_rovodev_sample_operative_note.md"
    echo "  - tmp_rovodev_sample_config.json"
    echo "  - tmp_rovodev_simple_test_config.json"
}

# Parse command line arguments
case "${1:-help}" in
    "inline")
        run_inline_direct_test
        ;;
    "sample")
        run_sample_direct_test
        ;;
    "simple")
        run_simple_direct_test
        ;;
    "custom")
        run_custom_direct_test "$2" "$3"
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
echo "✅ Direct test completed! Check the output above for results."
echo "📄 Detailed results saved to tmp_rovodev_direct_test_results_*.json"
echo ""
echo "To clean up temporary files, run:"
echo "  rm tmp_rovodev_direct_*"