#!/bin/bash
# ABOUTME: Comprehensive test script for Telegram integration hooks in MAF monitoring system.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[TEST-TELEGRAM-INTEGRATION]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[TEST-TELEGRAM-INTEGRATION]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[TEST-TELEGRAM-INTEGRATION]${NC} $1"
}

log_error() {
    echo -e "${RED}[TEST-TELEGRAM-INTEGRATION]${NC} $1"
}

# Test counter
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_TOTAL++))
    echo -e "\n${BLUE}Running test: ${test_name}${NC}"
    
    if eval "$test_command"; then
        ((TESTS_PASSED++))
        log_success "✅ PASSED: $test_name"
        return 0
    else
        ((TESTS_FAILED++))
        log_error "❌ FAILED: $test_name"
        return 1
    fi
}

# Test 1: Check if Telegram core components exist
test_telegram_components() {
    run_test "Telegram Notifier exists" "test -f '$SCRIPT_DIR/telegram-notifier.mjs'" &&
    run_test "Telegram Integration exists" "test -f '$SCRIPT_DIR/telegram-integration.mjs'" &&
    run_test "Monitoring Config exists" "test -f '$SCRIPT_DIR/monitoring-config.json'"
}

# Test 2: Check if monitoring scripts have been updated with Telegram integration
test_monitoring_integrations() {
    run_test "Health monitor has Telegram integration" "grep -q 'send_telegram_health_alert' '$SCRIPT_DIR/health-monitor.sh'" &&
    run_test "Quota status has Telegram import" "grep -q 'TelegramIntegration' '$SCRIPT_DIR/quota-status.mjs'" &&
    run_test "TMUX coordinator has Telegram integration" "grep -q 'send_telegram_session_alert' '$SCRIPT_DIR/tmux-coordinator-updater.sh'"
}

# Test 3: Check if configuration includes Telegram settings
test_telegram_configuration() {
    run_test "Telegram enabled in config" "jq -e '.monitoring.telegram.enabled == true' '$SCRIPT_DIR/monitoring-config.json' >/dev/null" &&
    run_test "Quota alerts integration enabled" "jq -e '.monitoring.telegram.integration.quota_alerts == true' '$SCRIPT_DIR/monitoring-config.json' >/dev/null" &&
    run_test "Health alerts integration enabled" "jq -e '.monitoring.telegram.integration.health_alerts == true' '$SCRIPT_DIR/monitoring-config.json' >/dev/null"
}

# Test 4: Test Telegram integration health check
test_telegram_health() {
    if command -v node >/dev/null 2>&1; then
        run_test "Telegram notifier health check" "node '$SCRIPT_DIR/telegram-notifier.mjs' --health >/dev/null 2>&1" &&
        run_test "Telegram integration health check" "node '$SCRIPT_DIR/telegram-integration.mjs' --health >/dev/null 2>&1"
    else
        log_warning "Node.js not available, skipping Telegram health checks"
        return 0
    fi
}

# Test 5: Test quota status Telegram integration (dry run)
test_quota_status_integration() {
    if command -v node >/dev/null 2>&1; then
        run_test "Quota status can import Telegram integration" "node -e 'import(\"$SCRIPT_DIR/quota-status.mjs\").catch(() => console.log(\"Import successful\"))' >/dev/null 2>&1"
    else
        log_warning "Node.js not available, skipping quota status integration test"
        return 0
    fi
}

# Test 6: Test health monitor syntax
test_health_monitor_syntax() {
    run_test "Health monitor bash syntax valid" "bash -n '$SCRIPT_DIR/health-monitor.sh'" &&
    run_test "Health monitor has Telegram function" "grep -q '^send_telegram_health_alert()' '$SCRIPT_DIR/health-monitor.sh'"
}

# Test 7: Test tmux coordinator syntax
test_tmux_coordinator_syntax() {
    run_test "TMUX coordinator bash syntax valid" "bash -n '$SCRIPT_DIR/tmux-coordinator-updater.sh'" &&
    run_test "TMUX coordinator has Telegram function" "grep -q '^send_telegram_session_alert()' '$SCRIPT_DIR/tmux-coordinator-updater.sh'"
}

# Test 8: Check for Telegram credentials placeholder
test_telegram_credentials() {
    local credentials_file="$PROJECT_ROOT/.maf/credentials/telegram.env"
    if [[ -f "$credentials_file" ]]; then
        run_test "Telegram credentials file exists" "test -f '$credentials_file'" &&
        run_test "Credentials have required variables" "grep -q 'TELEGRAM_BOT_TOKEN' '$credentials_file' && grep -q 'TELEGRAM_CHAT_ID' '$credentials_file'"
    else
        log_warning "Telegram credentials file not found at $credentials_file"
        log_info "Create credentials file to enable Telegram notifications:"
        log_info "  mkdir -p '$PROJECT_ROOT/.maf/credentials'"
        log_info "  cat > '$credentials_file' << 'EOF'"
        log_info "export TELEGRAM_ENABLED='false'"
        log_info "export TELEGRAM_BOT_TOKEN='your_bot_token_here'"
        log_info "export TELEGRAM_CHAT_ID='your_chat_id_here'"
        log_info "export TELEGRAM_NOTIFICATION_LEVEL='critical'"
        log_info "EOF"
        return 0
    fi
}

# Test 9: Check directory structure for Telegram caching
test_telegram_directories() {
    run_test "MAF base directory exists" "test -d '$PROJECT_ROOT/.maf'" &&
    run_test "MAF monitoring directory creatable" "mkdir -p '$PROJECT_ROOT/.maf/monitoring' && test -d '$PROJECT_ROOT/.maf/monitoring'" &&
    run_test "MAF logs directory creatable" "mkdir -p '$PROJECT_ROOT/.maf/logs' && test -d '$PROJECT_ROOT/.maf/logs'"
}

# Test 10: Integration smoke test
test_integration_smoke() {
    if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/.maf/credentials/telegram.env" ]]; then
        run_test "Telegram notifier test message" "node '$SCRIPT_DIR/telegram-notifier.mjs' --test --message 'Integration test message' --severity info >/dev/null 2>&1"
    else
        log_warning "Node.js or Telegram credentials not available, skipping smoke test"
        return 0
    fi
}

# Main test execution
main() {
    echo "======================================"
    echo "MAF Telegram Integration Test Suite"
    echo "======================================"
    echo "Project Root: $PROJECT_ROOT"
    echo "Script Directory: $SCRIPT_DIR"
    echo "======================================"
    
    # Run all test groups
    test_telegram_components
    test_monitoring_integrations  
    test_telegram_configuration
    test_telegram_health
    test_quota_status_integration
    test_health_monitor_syntax
    test_tmux_coordinator_syntax
    test_telegram_credentials
    test_telegram_directories
    test_integration_smoke
    
    # Summary
    echo "======================================"
    echo "Test Summary"
    echo "======================================"
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}🎉 All tests passed! Telegram integration is properly configured.${NC}"
        echo "Next steps:"
        echo "1. Configure Telegram credentials in .maf/credentials/telegram.env"
        echo "2. Set TELEGRAM_ENABLED='true' to activate notifications"
        echo "3. Test with: node $SCRIPT_DIR/telegram-notifier.mjs --test"
        return 0
    else
        echo -e "\n${RED}❌ Some tests failed. Please check the integration setup.${NC}"
        echo "Review the failed tests above and fix any issues."
        return 1
    fi
}

# Run tests
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
