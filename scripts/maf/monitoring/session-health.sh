#!/bin/bash
# ABOUTME: Session integrity and health monitoring for MAF tmux orchestration system.
# ABOUTME: Monitors tmux sessions, windows, and agent session lifecycle.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source dependencies
source "$PARENT_DIR/lib/error-handling.sh"
source "$PARENT_DIR/lib/tmux-utils.sh"
source "$PARENT_DIR/lib/agent-utils.sh"

# Configuration
STALE_SESSION_MINUTES=30
ORPHANED_SESSION_ALERT=true
RESOURCE_MONITORING=true

# Check tmux server health
check_tmux_server_health() {
    log_func_info "check_tmux_server_health" "Checking tmux server health"
    
    echo "Tmux Server Health"
    echo "=================="
    
    # Check if tmux is installed
    if ! command -v tmux &>/dev/null; then
        echo "❌ tmux command not found"
        return 1
    fi
    
    local tmux_version
    tmux_version=$(tmux -V 2>/dev/null | cut -d' ' -f2 || echo "unknown")
    echo "Version: $tmux_version"
    
    # Check if tmux server is running
    if tmux list-sessions &>/dev/null; then
        echo "✅ tmux server is running"
        
        # Get server info
        local session_count
        session_count=$(tmux list-sessions 2>/dev/null | wc -l)
        echo "Active sessions: $session_count"
        
        # Get tmux server process info
        local tmux_pid
        tmux_pid=$(pgrep tmux | head -1 || echo "unknown")
        if [[ "$tmux_pid" != "unknown" ]]; then
            echo "Server PID: $tmux_pid"
            
            # Get memory usage
            local tmux_mem
            tmux_mem=$(ps -p "$tmux_pid" -o %mem --no-headers 2>/dev/null | xargs || echo "unknown")
            echo "Memory usage: ${tmux_mem}%"
        fi
        
    else
        echo "❌ tmux server is not running"
        return 1
    fi
    
    echo
    return 0
}

# Analyze MAF sessions
analyze_maf_sessions() {
    log_func_info "analyze_maf_sessions" "Analyzing MAF agent sessions"
    
    echo "MAF Session Analysis"
    echo "===================="
    
    local total_sessions=0
    local healthy_sessions=0
    local stale_sessions=0
    local orphaned_sessions=0
    local unresponsive_sessions=0
    
    # Get all MAF sessions
    local maf_sessions
    maf_sessions=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" || true)
    
    if [[ -z "$maf_sessions" ]]; then
        echo "No MAF agent sessions found"
        return 0
    fi
    
    echo "Session Details:"
    echo
    
    while IFS= read -r session_line; do
        if [[ -n "$session_line" ]]; then
            ((total_sessions++))
            
            local session_name=$(echo "$session_line" | cut -d':' -f1)
            local session_details=$(echo "$session_line" | cut -d':' -f2-)
            local windows=$(echo "$session_details" | grep -o '[0-9]* windows' | cut -d' ' -f1)
            local created=$(echo "$session_details" | grep -o '(created [^)]*)' | sed 's/(created //' | sed 's/)//' || echo "unknown")
            
            # Extract agent ID from session name
            local agent_id=${session_name#maf-agent-}
            
            # Check session status
            local status="✅ Healthy"
            local issues=()
            
            # Check if agent exists in registry
            if ! find_agent "$agent_id" &>/dev/null; then
                status="🔶 Orphaned"
                ((orphaned_sessions++))
                issues+=("Agent not in registry")
            fi
            
            # Check session age
            if [[ "$created" != "unknown" ]]; then
                local creation_time=$(date -d "$created" +%s 2>/dev/null || echo "0")
                local current_time=$(date +%s)
                local age_minutes=$(((current_time - creation_time) / 60))
                
                if [[ $age_minutes -gt $STALE_SESSION_MINUTES ]]; then
                    status="⏰ Stale"
                    ((stale_sessions++))
                    issues+=("Session age: ${age_minutes}m")
                fi
            fi
            
            # Check session responsiveness
            if ! tmux display-message -t "$session_name" &>/dev/null; then
                status="❌ Unresponsive"
                ((unresponsive_sessions++))
                issues+=("Session not responding")
            fi
            
            if [[ ${#issues[@]} -eq 0 ]]; then
                ((healthy_sessions++))
            fi
            
            # Display session info
            printf "%-30s %s\n" "$session_name" "$status"
            printf "  Agent ID: %s\n" "$agent_id"
            printf "  Windows: %s\n" "$windows"
            printf "  Created: %s\n" "$created"
            
            if [[ ${#issues[@]} -gt 0 ]]; then
                printf "  Issues: %s\n" "$(IFS=', '; echo "${issues[*]}")"
            fi
            
            echo
        fi
    done <<< "$maf_sessions"
    
    # Summary
    echo "Session Summary:"
    echo "  Total sessions: $total_sessions"
    echo "  Healthy: $healthy_sessions"
    echo "  Stale: $stale_sessions"
    echo "  Orphaned: $orphaned_sessions"
    echo "  Unresponsive: $unresponsive_sessions"
    
    return 0
}

# Check session window health
check_session_windows() {
    local agent_id="${1:-}"
    
    log_func_info "check_session_windows" "Checking session windows for agent: ${agent_id:-all}"
    
    if [[ -n "$agent_id" ]]; then
        echo "Window Health for Agent: $agent_id"
        echo "=================================="
        
        local session_name="maf-agent-$agent_id"
        if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
            echo "Session not found: $session_name"
            return 1
        fi
        
        # Get windows for this session
        tmux list-windows -t "$session_name" 2>/dev/null | while IFS= read -r window_line; do
            if [[ -n "$window_line" ]]; then
                echo "$window_line"
                
                # Extract window number and name
                local window_num=$(echo "$window_line" | grep -o '^[0-9]*')
                local window_name=$(echo "$window_line" | grep -o '[^(]*' | sed 's/^[0-9]*: *//' | xargs)
                
                # Check if window is responsive
                if tmux capture-pane -t "$session_name:$window_num" &>/dev/null; then
                    echo "  Status: ✅ Responsive"
                else
                    echo "  Status: ❌ Unresponsive"
                fi
                
                # Get recent activity (last 3 lines)
                echo "  Recent activity:"
                tmux capture-pane -t "$session_name:$window_num" -p -S -3 2>/dev/null | sed 's/^/    /' || echo "    No output available"
                
                echo
            fi
        done
        
    else
        echo "Window Health - All Sessions"
        echo "============================"
        
        # Get all MAF sessions and their windows
        tmux list-sessions 2>/dev/null | grep "^maf-agent-" | while IFS=':' read -r session_name rest; do
            if [[ -n "$session_name" ]]; then
                echo "Session: $session_name"
                echo "$rest"
                
                tmux list-windows -t "$session_name" 2>/dev/null | while IFS= read -r window_line; do
                    echo "  $window_line"
                done
                
                echo
            fi
        done
    fi
    
    return 0
}

# Monitor session resources
monitor_session_resources() {
    local agent_id="${1:-}"
    local duration_minutes="${2:-1}"
    
    log_func_info "monitor_session_resources" "Monitoring resources for agent: ${agent_id:-all}"
    
    if [[ -n "$agent_id" ]]; then
        echo "Resource Monitoring: $agent_id"
        echo "Duration: $duration_minutes minutes"
        echo "==============================="
        
        local session_name="maf-agent-$agent_id"
        if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
            echo "Session not found: $session_name"
            return 1
        fi
        
        # Get session PID
        local session_pid
        session_pid=$(pgrep -f "tmux.*session.*$session_name" | head -1 || echo "unknown")
        
        if [[ "$session_pid" == "unknown" ]]; then
            echo "Could not find session PID"
            return 1
        fi
        
        echo "Session PID: $session_pid"
        echo "Timestamp           CPU%  MEM%  Status"
        echo "----------------------------------------"
        
        local iterations=$((duration_minutes * 2))  # Check every 30 seconds
        local iteration=0
        
        while [[ $iteration -lt $iterations ]]; do
            local timestamp=$(date '+%H:%M:%S')
            
            # Get resource usage
            local cpu_usage=$(ps -p "$session_pid" -o %cpu --no-headers 2>/dev/null | xargs || echo "0")
            local mem_usage=$(ps -p "$session_pid" -o %mem --no-headers 2>/dev/null | xargs || echo "0")
            
            # Check session status
            local status="Active"
            if ! tmux display-message -t "$session_name" &>/dev/null; then
                status="Error"
            fi
            
            printf "%-20s %5s %5s  %s\n" "$timestamp" "${cpu_usage}" "${mem_usage}" "$status"
            
            sleep 30
            ((iteration++))
        done
        
    else
        echo "Resource Usage - All Sessions"
        echo "============================="
        
        printf "%-30s %8s %8s %s\n" "Session" "CPU%" "MEM%" "Status"
        echo "--------------------------------------------------------"
        
        tmux list-sessions 2>/dev/null | grep "^maf-agent-" | while IFS=':' read -r session_name rest; do
            if [[ -n "$session_name" ]]; then
                # Get session PID
                local session_pid
                session_pid=$(pgrep -f "tmux.*session.*$session_name" | head -1 || echo "unknown")
                
                if [[ "$session_pid" != "unknown" ]]; then
                    local cpu_usage=$(ps -p "$session_pid" -o %cpu --no-headers 2>/dev/null | xargs || echo "0")
                    local mem_usage=$(ps -p "$session_pid" -o %mem --no-headers 2>/dev/null | xargs || echo "0")
                    local status="Active"
                    
                    if ! tmux display-message -t "$session_name" &>/dev/null; then
                        status="Error"
                    fi
                    
                    printf "%-30s %8s %8s %s\n" "$session_name" "$cpu_usage" "$mem_usage" "$status"
                else
                    printf "%-30s %8s %8s %s\n" "$session_name" "N/A" "N/A" "No PID"
                fi
            fi
        done
    fi
    
    return 0
}

# Cleanup problematic sessions
cleanup_problematic_sessions() {
    local dry_run="${1:-true}"
    local cleanup_stale="${2:-false}"
    local cleanup_orphaned="${3:-false}"
    
    log_func_info "cleanup_problematic_sessions" "Cleaning up problematic sessions (dry_run: $dry_run)"
    
    if [[ "$dry_run" == "true" ]]; then
        echo "DRY RUN - No sessions will be actually terminated"
        echo "==============================================="
    else
        echo "LIVE CLEANUP - Sessions will be terminated!"
        echo "========================================"
    fi
    
    local sessions_cleaned=0
    
    # Get all MAF sessions
    tmux list-sessions 2>/dev/null | grep "^maf-agent-" | while IFS=':' read -r session_name rest; do
        if [[ -n "$session_name" ]]; then
            local agent_id=${session_name#maf-agent-}
            local should_cleanup=false
            local cleanup_reason=""
            
            # Check if session is orphaned
            if [[ "$cleanup_orphaned" == "true" ]] && ! find_agent "$agent_id" &>/dev/null; then
                should_cleanup=true
                cleanup_reason="Orphaned session"
            fi
            
            # Check if session is stale
            if [[ "$cleanup_stale" == "true" ]]; then
                local created=$(echo "$rest" | grep -o '(created [^)]*)' | sed 's/(created //' | sed 's/)//' || echo "unknown")
                if [[ "$created" != "unknown" ]]; then
                    local creation_time=$(date -d "$created" +%s 2>/dev/null || echo "0")
                    local current_time=$(date +%s)
                    local age_minutes=$(((current_time - creation_time) / 60))
                    
                    if [[ $age_minutes -gt $STALE_SESSION_MINUTES ]]; then
                        should_cleanup=true
                        cleanup_reason="Stale session (${age_minutes} minutes old)"
                    fi
                fi
            fi
            
            if [[ "$should_cleanup" == "true" ]]; then
                echo "Session marked for cleanup: $session_name"
                echo "  Reason: $cleanup_reason"
                
                if [[ "$dry_run" == "false" ]]; then
                    echo "  Action: Terminating session..."
                    if tmux kill-session -t "$session_name" 2>/dev/null; then
                        echo "  Result: ✅ Session terminated"
                        ((sessions_cleaned++))
                    else
                        echo "  Result: ❌ Failed to terminate session"
                    fi
                else
                    echo "  Action: Would terminate session (DRY RUN)"
                fi
                echo
            fi
        fi
    done
    
    if [[ "$dry_run" == "false" ]]; then
        echo "Cleanup completed. Sessions cleaned: $sessions_cleaned"
    else
        echo "Dry run completed. Use 'live' mode to actually clean up sessions."
    fi
    
    return 0
}

# Session recovery operations
recover_session() {
    local agent_id="$1"
    local recovery_type="${2:-restart}"
    
    log_func_info "recover_session" "Attempting recovery for agent: $agent_id (type: $recovery_type)"
    
    validate_required_args "recover_session" "$agent_id"
    
    local session_name="maf-agent-$agent_id"
    local agent_info
    
    echo "Session Recovery: $agent_id"
    echo "Recovery type: $recovery_type"
    echo "============================="
    
    # Get agent information
    agent_info=$(find_agent "$agent_id")
    if [[ -z "$agent_info" ]]; then
        echo "❌ Agent not found in registry"
        return 1
    fi
    
    local agent_type=$(echo "$agent_info" | jq -r '.type')
    echo "Agent type: $agent_type"
    
    # Check current session status
    if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "✅ Session exists: $session_name"
        
        # Test session responsiveness
        if tmux display-message -t "$session_name" &>/dev/null; then
            echo "✅ Session is responsive"
            echo "No recovery needed"
            return 0
        else
            echo "❌ Session is unresponsive"
        fi
    else
        echo "❌ Session not found"
    fi
    
    case "$recovery_type" in
        "restart")
            echo "Attempting session restart..."
            
            # Kill existing session if it exists
            if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
                echo "Terminating existing session..."
                tmux kill-session -t "$session_name" 2>/dev/null || echo "Failed to kill session"
            fi
            
            # Wait a moment
            sleep 2
            
            # Create new session
            echo "Creating new session..."
            if create_agent_session "$agent_id" "$agent_type"; then
                echo "✅ Session recreated successfully"
                update_agent_status "$agent_id" "active" '{"recovered": true}'
            else
                echo "❌ Failed to create new session"
                return 1
            fi
            ;;
            
        "reattach")
            echo "Attempting to reattach to existing session..."
            if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
                # Try to send a simple command to test responsiveness
                if send_command_to_session "$agent_id" "1" "echo 'recovery-test-$(date +%s)'" 2>/dev/null; then
                    echo "✅ Session reattached successfully"
                else
                    echo "❌ Session still unresponsive after reattach attempt"
                    return 1
                fi
            else
                echo "❌ No session to reattach to"
                return 1
            fi
            ;;
            
        *)
            echo "❌ Unknown recovery type: $recovery_type"
            echo "Supported types: restart, reattach"
            return 1
            ;;
    esac
    
    echo "Recovery completed"
    return 0
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-help}" in
        "server")
            check_tmux_server_health
            ;;
        "analyze")
            analyze_maf_sessions
            ;;
        "windows")
            check_session_windows "${2:-}"
            ;;
        "resources")
            monitor_session_resources "${2:-}" "${3:-1}"
            ;;
        "cleanup")
            cleanup_problematic_sessions "${2:-dry}" "${3:-false}" "${4:-false}"
            ;;
        "recover")
            recover_session "${2:-}" "${3:-restart}"
            ;;
        "help"|*)
            echo "Usage: $0 {server|analyze|windows [agent_id]|resources [agent_id] [minutes]|cleanup [dry|live] [stale] [orphaned]|recover <agent_id> [restart|reattach]|help}"
            echo "  server                              - Check tmux server health"
            echo "  analyze                             - Analyze all MAF sessions"
            echo "  windows [agent_id]                  - Check session windows health"
            echo "  resources [agent_id] [minutes]      - Monitor resource usage"
            echo "  cleanup [dry|live] [stale] [orphaned] - Cleanup problematic sessions"
            echo "  recover <agent_id> [restart|reattach] - Recover problematic session"
            echo "  help                                - Show this help"
            echo
            echo "Examples:"
            echo "  $0 analyze"
            echo "  $0 windows claude-worker-12345"
            echo "  $0 resources claude-worker-12345 5"
            echo "  $0 cleanup live true true"
            echo "  $0 recover claude-worker-12345 restart"
            exit 1
            ;;
    esac
fi
