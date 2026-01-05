#!/bin/bash
# ABOUTME: Individual agent health monitoring and diagnostics for MAF system.
# ABOUTME: Provides detailed agent-specific health checks and performance metrics.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source dependencies
source "$PARENT_DIR/lib/error-handling.sh"
source "$PARENT_DIR/lib/tmux-utils.sh"
source "$PARENT_DIR/lib/agent-utils.sh"

# Agent-specific health check
check_agent_health() {
    local agent_id="$1"
    local detailed="${2:-false}"
    
    log_func_info "check_agent_health" "Checking health for agent: $agent_id"
    
    validate_required_args "check_agent_health" "$agent_id"
    
    local health_score=100
    local issues=()
    
    echo "Agent Health Report: $agent_id"
    echo "==============================="
    
    # Check if agent exists in registry
    local agent_info
    agent_info=$(find_agent "$agent_id")
    if [[ -z "$agent_info" ]]; then
        echo "❌ Agent not found in registry"
        return 1
    fi
    
    local agent_type=$(echo "$agent_info" | jq -r '.type')
    local agent_status=$(echo "$agent_info" | jq -r '.status')
    local session_name=$(echo "$agent_info" | jq -r '.session // empty')
    local created_time=$(echo "$agent_info" | jq -r '.created')
    local last_seen=$(echo "$agent_info" | jq -r '.last_seen')
    
    echo "Type: $agent_type"
    echo "Status: $agent_status"
    echo "Session: $session_name"
    echo "Created: $created_time"
    echo "Last Seen: $last_seen"
    echo
    
    # Check tmux session
    if [[ -n "$session_name" ]]; then
        if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
            echo "✅ Tmux session exists: $session_name"
            
            # Get session details
            local session_details
            session_details=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")
            echo "Session Info: $session_details"
            
            # Check session windows
            local window_count=$(echo "$session_details" | grep -o '[0-9]* windows' | cut -d' ' -f1)
            echo "Windows: $window_count"
            
            if [[ "$detailed" == "true" ]]; then
                echo
                echo "Session Windows:"
                tmux list-windows -t "$session_name" 2>/dev/null | while IFS= read -r line; do
                    echo "  $line"
                done
            fi
        else
            echo "❌ Tmux session not found: $session_name"
            health_score=$((health_score - 50))
            issues+=("Session not found")
        fi
    else
        echo "❌ No session associated with agent"
        health_score=$((health_score - 30))
        issues+=("No session")
    fi
    
    echo
    
    # Check agent log files
    local agent_log_dir="$PROJECT_ROOT/.maf/logs/agents/$agent_id"
    if [[ -d "$agent_log_dir" ]]; then
        echo "✅ Agent log directory exists"
        
        local log_files=$(find "$agent_log_dir" -name "*.log" -type f 2>/dev/null)
        local log_count=$(echo "$log_files" | wc -l)
        echo "Log files: $log_count"
        
        if [[ "$detailed" == "true" ]] && [[ $log_count -gt 0 ]]; then
            echo
            echo "Recent log activity:"
            for log_file in $log_files; do
                local filename=$(basename "$log_file")
                local recent_lines=$(tail -5 "$log_file" 2>/dev/null | wc -l)
                echo "  $filename: $recent_lines recent lines"
            done
        fi
    else
        echo "❌ Agent log directory not found"
        health_score=$((health_score - 20))
        issues+=("No log directory")
    fi
    
    echo
    
    # Check agent responsiveness
    if [[ -n "$session_name" ]]; then
        echo "Testing agent responsiveness..."
        
        # Try to send a simple command to test responsiveness
        local test_command="echo 'health-check-$(date +%s)'"
        if send_command_to_session "$agent_id" "1" "$test_command" 2>/dev/null; then
            echo "✅ Agent session is responsive"
        else
            echo "❌ Agent session not responsive"
            health_score=$((health_score - 25))
            issues+=("Not responsive")
        fi
    fi
    
    echo
    
    # Resource usage for agent session
    if [[ -n "$session_name" ]]; then
        echo "Resource usage:"
        local resource_usage
        resource_usage=$(monitor_resource_usage "$agent_id" 2>/dev/null || echo "0|0|unknown")
        local cpu_usage=$(echo "$resource_usage" | cut -d'|' -f1)
        local mem_usage=$(echo "$resource_usage" | cut -d'|' -f2)
        local session_pid=$(echo "$resource_usage" | cut -d'|' -f3)
        
        echo "  CPU: ${cpu_usage}%"
        echo "  Memory: ${mem_usage}%"
        if [[ "$session_pid" != "unknown" ]]; then
            echo "  PID: $session_pid"
        fi
    fi
    
    echo
    
    # Agent tasks and statistics
    local tasks_completed=$(echo "$agent_info" | jq -r '.tasks_completed // 0')
    local errors_count=$(echo "$agent_info" | jq -r '.errors_count // 0')
    
    echo "Performance:"
    echo "  Tasks completed: $tasks_completed"
    echo "  Errors count: $errors_count"
    
    if [[ $tasks_completed -gt 0 ]]; then
        local success_rate=$(( (tasks_completed - errors_count) * 100 / tasks_completed ))
        echo "  Success rate: ${success_rate}%"
    fi
    
    echo
    
    # Overall health assessment
    echo "Health Assessment:"
    echo "  Score: $health_score/100"
    
    if [[ $health_score -ge 80 ]]; then
        echo "  Status: ✅ Healthy"
    elif [[ $health_score -ge 60 ]]; then
        echo "  Status: ⚠️  Degraded"
    else
        echo "  Status: ❌ Unhealthy"
    fi
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        echo "  Issues:"
        for issue in "${issues[@]}"; do
            echo "    - $issue"
        done
    fi
    
    return 0
}

# Quick health check for all agents
health_check_all_agents_quick() {
    log_func_info "health_check_all_agents_quick" "Running quick health check on all agents"
    
    echo "Quick Agent Health Summary"
    echo "=========================="
    
    local total_agents=0
    local healthy_agents=0
    local degraded_agents=0
    local unhealthy_agents=0
    
    if [[ -f "$PROJECT_ROOT/.maf/agents.json" ]]; then
        local agents
        agents=$(jq -r '.agents[].id' "$PROJECT_ROOT/.maf/agents.json" 2>/dev/null || true)
        
        for agent_id in $agents; do
            if [[ -n "$agent_id" ]]; then
                ((total_agents++))
                
                # Quick check - session exists and agent is in registry
                local session_name="maf-agent-$agent_id"
                local status="❌ Unknown"
                
                if find_agent "$agent_id" &>/dev/null; then
                    if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
                        if agent_health_check "$agent_id" &>/dev/null; then
                            status="✅ Healthy"
                            ((healthy_agents++))
                        else
                            status="⚠️  Degraded"
                            ((degraded_agents++))
                        fi
                    else
                        status="❌ No Session"
                        ((unhealthy_agents++))
                    fi
                else
                    status="❌ Not Found"
                    ((unhealthy_agents++))
                fi
                
                printf "%-30s %s\n" "$agent_id" "$status"
            fi
        done
    else
        echo "No agents registered"
        return 1
    fi
    
    echo
    echo "Summary:"
    echo "  Total agents: $total_agents"
    echo "  Healthy: $healthy_agents"
    echo "  Degraded: $degraded_agents"
    echo "  Unhealthy: $unhealthy_agents"
    
    return 0
}

# Agent performance monitoring
monitor_agent_performance() {
    local agent_id="$1"
    local duration_minutes="${2:-5}"
    
    log_func_info "monitor_agent_performance" "Monitoring performance for agent: $agent_id ($duration_minutes minutes)"
    
    validate_required_args "monitor_agent_performance" "$agent_id"
    
    local session_name="maf-agent-$agent_id"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_error "Agent session not found: $session_name"
        return 1
    fi
    
    echo "Performance Monitoring: $agent_id"
    echo "Duration: $duration_minutes minutes"
    echo "Starting at: $(date)"
    echo
    
    local iterations=$((duration_minutes * 2))  # Check every 30 seconds
    local iteration=0
    
    while [[ $iteration -lt $iterations ]]; do
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        
        # Get resource usage
        local resource_usage
        resource_usage=$(monitor_resource_usage "$agent_id" 2>/dev/null || echo "0|0|unknown")
        local cpu_usage=$(echo "$resource_usage" | cut -d'|' -f1)
        local mem_usage=$(echo "$resource_usage" | cut -d'|' -f2)
        
        printf "[%s] CPU: %3s%%  Memory: %3s%%\n" "$timestamp" "$cpu_usage" "$mem_usage"
        
        sleep 30
        ((iteration++))
    done
    
    echo
    echo "Monitoring completed at: $(date)"
    return 0
}

# Agent diagnostics
run_agent_diagnostics() {
    local agent_id="$1"
    
    log_func_info "run_agent_diagnostics" "Running diagnostics for agent: $agent_id"
    
    validate_required_args "run_agent_diagnostics" "$agent_id"
    
    echo "Agent Diagnostics: $agent_id"
    echo "============================="
    
    # System information
    echo "System Information:"
    echo "  Hostname: $(hostname)"
    echo "  OS: $(uname -s -r)"
    echo "  Uptime: $(uptime -p 2>/dev/null || uptime)"
    echo "  Load Average: $(cat /proc/loadavg | cut -d' ' -f1-3)"
    echo
    
    # Agent registry information
    echo "Registry Information:"
    local agent_info
    agent_info=$(find_agent "$agent_id")
    if [[ -n "$agent_info" ]]; then
        echo "$agent_info" | jq -r 'to_entries[] | "  \(.key): \(.value)"'
    else
        echo "  Agent not found in registry"
    fi
    echo
    
    # Session diagnostics
    local session_name="maf-agent-$agent_id"
    if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "Session Diagnostics:"
        echo "  Session exists: Yes"
        
        # Session details
        local session_details
        session_details=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")
        echo "  Session details: $session_details"
        
        # Window information
        echo "  Windows:"
        tmux list-windows -t "$session_name" 2>/dev/null | while IFS= read -r line; do
            echo "    $line"
        done
        echo
        
        # Try to capture some output from the main window
        echo "Recent Activity (main window):"
        tmux capture-pane -t "$session_name:1" -p -S -10 2>/dev/null | head -10 || echo "  Could not capture output"
    else
        echo "Session Diagnostics:"
        echo "  Session exists: No"
    fi
    echo
    
    # Log file diagnostics
    local agent_log_dir="$PROJECT_ROOT/.maf/logs/agents/$agent_id"
    if [[ -d "$agent_log_dir" ]]; then
        echo "Log Diagnostics:"
        echo "  Log directory: $agent_log_dir"
        
        local log_files
        log_files=$(find "$agent_log_dir" -name "*.log" -type f 2>/dev/null)
        for log_file in $log_files; do
            local filename=$(basename "$log_file")
            local file_size=$(du -h "$log_file" | cut -f1)
            local line_count=$(wc -l < "$log_file")
            local mod_time=$(stat -c %y "$log_file" 2>/dev/null || echo "unknown")
            
            echo "  $filename: $file_size, $line_count lines, modified: $mod_time"
        done
    else
        echo "Log Diagnostics:"
        echo "  Log directory: Not found"
    fi
    echo
    
    # Network connectivity test
    echo "Connectivity Test:"
    if ping -c 1 8.8.8.8 &>/dev/null; then
        echo "  Internet: ✅ Connected"
    else
        echo "  Internet: ❌ Disconnected"
    fi
    
    return 0
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-help}" in
        "check")
            check_agent_health "${2:-}" "${3:-false}"
            ;;
        "all")
            health_check_all_agents_quick
            ;;
        "monitor")
            monitor_agent_performance "${2:-}" "${3:-5}"
            ;;
        "diagnose")
            run_agent_diagnostics "${2:-}"
            ;;
        "help"|*)
            echo "Usage: $0 {check <agent_id> [detailed]|all|monitor <agent_id> [minutes]|diagnose <agent_id>|help}"
            echo "  check <agent_id> [detailed] - Check health of specific agent"
            echo "  all                           - Quick health check of all agents"
            echo "  monitor <agent_id> [minutes]  - Monitor agent performance (default: 5 minutes)"
            echo "  diagnose <agent_id>           - Run full diagnostics for agent"
            echo "  help                          - Show this help"
            echo
            echo "Examples:"
            echo "  $0 check claude-worker-12345 detailed"
            echo "  $0 all"
            echo "  $0 monitor claude-worker-12345 10"
            echo "  $0 diagnose claude-worker-12345"
            exit 1
            ;;
    esac
fi
