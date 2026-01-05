#!/bin/bash
# ABOUTME: tmux coordinator pane updater with real-time quota monitoring.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Configuration
QUOTA_STATUS_SCRIPT="$PROJECT_ROOT/scripts/maf/monitoring/quota-status.mjs"
UPDATE_INTERVAL=30
TMUX_SESSION_PREFIX="maf-agent"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[COORDINATOR-UPDATER]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[COORDINATOR-UPDATER]${NC} $1"
}

# Check if tmux is available
check_tmux_available() {
    command -v tmux &> /dev/null && tmux list-sessions &> /dev/null
}

# Update coordinator window with quota status
update_coordinator_pane() {
    local session_name="$1"
    
    log_info "Updating coordinator in session: $session_name"
    
    # Get current quota status
    # Send alert if quota status script is missing
    send_telegram_session_alert "error" "$session_name" "{"error": "quota_status_script_missing", "path": "$QUOTA_STATUS_SCRIPT""}\n
    if ! [[ -f "$QUOTA_STATUS_SCRIPT" ]]; then
        echo "Quota status script not found"
        return 1
    fi
    
    local quota_status
    quota_status=$(node "$QUOTA_STATUS_SCRIPT" --format tmux 2>/dev/null || echo "Quota monitoring unavailable")
    
    # Clear and update coordinator pane
    tmux send-keys -t "$session_name:0" "C-c" "C-l" "Enter" 2>/dev/null || true
    sleep 1
    
    # Send coordinator header
    tmux send-keys -t "$session_name:0" "echo '======================================='" "Enter"
    tmux send-keys -t "$session_name:0" "echo 'MAF COORDINATOR - $(date '+%H:%M:%S')'" "Enter"
    tmux send-keys -t "$session_name:0" "echo '======================================='" "Enter"
    tmux send-keys -t "$session_name:0" "echo ''" "Enter"
    
    # Send quota status
    echo "$quota_status" | while IFS= read -r line; do
        tmux send-keys -t "$session_name:0" "echo '$line'" "Enter"
    done
    
    # Send footer
    tmux send-keys -t "$session_name:0" "echo ''" "Enter"
    tmux send-keys -t "$session_name:0" "echo 'Commands: npm run maf:status | tmux kill-session'" "Enter"
    tmux send-keys -t "$session_name:0" "echo 'Last updated: $(date)'" "Enter"
    
    log_success "Updated coordinator pane in session: $session_name"
    # Send success notification (only in continuous mode or for critical sessions)
    if [[ "${CONTINUOUS_MODE:-false}" == "true" ]] || [[ "$session_name" == *"master"* ]] || [[ "$session_name" == *"primary"* ]]; then
        send_telegram_session_alert "updated" "$session_name" "{"status": "coordinator_updated_successfully"}"
    fi
}

# One-time update for existing coordinator sessions
run_once() {
    log_info "Running one-time coordinator update"
    
    local updated_count=0
    
    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]]; then
            if update_coordinator_pane "$session_name"; then
                ((updated_count++))
            fi
        fi
    done < <(tmux list-sessions 2>/dev/null | grep "^${TMUX_SESSION_PREFIX}-" | cut -d':' -f1 || true)
    
    log_success "Updated $updated_count coordinator session(s)"
}

# Main execution
main() {
    local action="${1:-once}"
    
    if ! check_tmux_available; then
        echo "tmux not available"
        exit 1
    fi
    
    case "$action" in
        "once"|"")
            run_once
            ;;
        *)
            echo "Usage: $0 [once]"
            echo "Updates coordinator panes with quota status"
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

# Telegram integration for critical session alerts
send_telegram_session_alert() {
    local event_type="$1"
    local session_name="$2"
    local details="${3:-{}}"
    
    # Check if Telegram integration is enabled in config
    local config_file="$PROJECT_ROOT/scripts/maf/monitoring/monitoring-config.json"
    local telegram_enabled=$(jq -r '.monitoring.telegram.enabled // false' "$config_file" 2>/dev/null || echo "false")
    local system_alerts_enabled=$(jq -r '.monitoring.telegram.integration.system_alerts // true' "$config_file" 2>/dev/null || echo "true")
    
    if [[ "$telegram_enabled" != "true" ]] || [[ "$system_alerts_enabled" != "true" ]]; then
        return 0
    fi
    
    # Call Telegram integration script
    local telegram_script="$PROJECT_ROOT/scripts/maf/monitoring/telegram-integration.mjs"
    if [[ -f "$telegram_script" ]]; then
        # Create alert message based on event type
        local message="tmux coordinator session ${event_type}: ${session_name}"
        local severity="warning"
        
        case "$event_type" in
            "failed"|"error")
                severity="critical"
                ;;
            "created"|"started")
                severity="info"
                ;;
            "updated")
                severity="info"
                ;;
            *)
                severity="warning"
                ;;
        esac
        
        # Call the Telegram integration in background to avoid blocking
        node -e "
        import('./telegram-integration.mjs').then(({ TelegramIntegration }) => {
            const integration = new TelegramIntegration();
            integration.handleSystemAlert('tmux coordinator', '$message', '$severity', {session: '$session_name', event: '$event_type', $details})
                .catch(err => console.warn('Telegram session alert failed:', err.message));
        }).catch(err => console.warn('Telegram integration error:', err.message));
        " &
        
        echo "[TELEGRAM] Session alert queued for $session_name: $event_type"
    else
        echo "[WARN] Telegram integration script not found"
    fi
}

