#!/bin/bash
# ABOUTME: Comprehensive health monitoring daemon for MAF tmux orchestration system.
# ABOUTME: Monitors agents, sessions, resources, and system health with configurable alerts.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$SCRIPT_DIR"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." PARENT_DIR="$(cd "$SCRIPT_DIR" PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)" pwd)"PARENT_DIR="$(cd "$SCRIPT_DIR" PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)" pwd)" pwd)"

# Source dependencies
source "$SCRIPT_DIR/../lib/error-handling.sh"
source "$SCRIPT_DIR/../lib/tmux-utils.sh"
source "$SCRIPT_DIR/../lib/agent-utils.sh"

# Configuration
CONFIG_FILE="$MONITORING_DIR/monitoring-config.json"
MONITORING_DATA_DIR="$PROJECT_ROOT/.maf/monitoring"
HEALTH_STATUS_FILE="$MONITORING_DATA_DIR/health-status.json"
METRICS_FILE="$MONITORING_DATA_DIR/metrics.json"
ALERTS_FILE="$MONITORING_DATA_DIR/alerts.json"
PID_FILE="$MONITORING_DATA_DIR/health-monitor.pid"

# Default configuration values
HEALTH_CHECK_INTERVAL=30
RESOURCE_MONITORING_INTERVAL=60
LOG_COLLECTION_INTERVAL=15
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90
AGENT_TIMEOUT=120
STALE_SESSION_MINUTES=30
ERROR_RATE_THRESHOLD=5
LOG_LEVEL="info"
STRUCTURED_LOGS=true
MONITORING_ENABLED=true

# Health check flags
AGENT_CONNECTIVITY_CHECK=true
SESSION_INTEGRITY_CHECK=true
RESOURCE_UTILIZATION_CHECK=true
DISK_SPACE_CHECK=true
PROCESS_MONITORING=true
NETWORK_CONNECTIVITY_CHECK=true
GIT_REPO_HEALTH_CHECK=true
MAF_CLI_CHECK=true
AGENT_MAIL_CHECK=true
BEADS_WORKFLOW_CHECK=true

# Load configuration
load_monitoring_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        HEALTH_CHECK_INTERVAL=$(jq -r '.monitoring.health_check_interval_seconds // 30' "$CONFIG_FILE")
        RESOURCE_MONITORING_INTERVAL=$(jq -r '.monitoring.resource_monitoring_interval_seconds // 60' "$CONFIG_FILE")
        LOG_COLLECTION_INTERVAL=$(jq -r '.monitoring.log_collection_interval_seconds // 15' "$CONFIG_FILE")
        CPU_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.cpu_usage_percent // 80' "$CONFIG_FILE")
        MEMORY_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.memory_usage_percent // 85' "$CONFIG_FILE")
        DISK_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.disk_space_percent // 90' "$CONFIG_FILE")
        AGENT_TIMEOUT=$(jq -r '.monitoring.alert_thresholds.agent_response_timeout_seconds // 120' "$CONFIG_FILE")
        STALE_SESSION_MINUTES=$(jq -r '.monitoring.alert_thresholds.session_stale_minutes // 30' "$CONFIG_FILE")
        ERROR_RATE_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.error_rate_threshold // 5' "$CONFIG_FILE")
        
        LOG_LEVEL=$(jq -r '.logging.level // "info"' "$CONFIG_FILE")
        STRUCTURED_LOGS=$(jq -r '.logging.structured_format // true' "$CONFIG_FILE")
        MONITORING_ENABLED=$(jq -r '.monitoring.enabled // true' "$CONFIG_FILE")
        
        AGENT_CONNECTIVITY_CHECK=$(jq -r '.health_checks.agent_connectivity // true' "$CONFIG_FILE")
        SESSION_INTEGRITY_CHECK=$(jq -r '.health_checks.session_integrity // true' "$CONFIG_FILE")
        RESOURCE_UTILIZATION_CHECK=$(jq -r '.health_checks.resource_utilization // true' "$CONFIG_FILE")
        DISK_SPACE_CHECK=$(jq -r '.health_checks.disk_space_check // true' "$CONFIG_FILE")
        PROCESS_MONITORING=$(jq -r '.health_checks.process_monitoring // true' "$CONFIG_FILE")
        NETWORK_CONNECTIVITY_CHECK=$(jq -r '.health_checks.network_connectivity // true' "$CONFIG_FILE")
        GIT_REPO_HEALTH_CHECK=$(jq -r '.health_checks.git_repository_health // true' "$CONFIG_FILE")
        MAF_CLI_CHECK=$(jq -r '.health_checks.maf_cli_functionality // true' "$CONFIG_FILE")
        AGENT_MAIL_CHECK=$(jq -r '.health_checks.agent_mail_system // true' "$CONFIG_FILE")
        BEADS_WORKFLOW_CHECK=$(jq -r '.health_checks.beads_workflow_status // true' "$CONFIG_FILE")
    else
        log_warning "Configuration file not found: $CONFIG_FILE, using defaults"
    fi
}

# Initialize monitoring environment
initialize_monitoring() {
    log_func_info "initialize_monitoring" "Initializing MAF health monitoring system"
    
    # Create monitoring data directory
    mkdir -p "$MONITORING_DATA_DIR"
    
    # Load configuration
    load_monitoring_config
    
    # Initialize status files
    initialize_status_files
    
    # Check if monitoring is enabled
    if [[ "$MONITORING_ENABLED" != "true" ]]; then
        log_info "Monitoring is disabled in configuration"
        exit 0
    fi
    
    log_success "Health monitoring system initialized"
    return 0
}

# Initialize status tracking files
initialize_status_files() {
    local timestamp=$(date -Iseconds)
    
    # Initialize health status file
    if [[ ! -f "$HEALTH_STATUS_FILE" ]]; then
        cat > "$HEALTH_STATUS_FILE" << EOF
{
  "timestamp": "$timestamp",
  "overall_status": "initializing",
  "agents": {},
  "sessions": {},
  "system": {},
  "checks": {
    "agent_connectivity": "unknown",
    "session_integrity": "unknown",
    "resource_utilization": "unknown",
    "disk_space": "unknown",
    "process_monitoring": "unknown",
    "network_connectivity": "unknown",
    "git_repository": "unknown",
    "maf_cli": "unknown",
    "agent_mail_system": "unknown",
    "beads_workflow": "unknown"
  },
  "last_updated": "$timestamp"
}
EOF
    fi
    
    # Initialize metrics file
    if [[ ! -f "$METRICS_FILE" ]]; then
        cat > "$METRICS_FILE" << EOF
{
  "timestamp": "$timestamp",
  "system_metrics": {
    "cpu_usage": 0,
    "memory_usage": 0,
    "disk_usage": 0,
    "load_average": []
  },
  "agent_metrics": {},
  "session_metrics": {},
  "performance_metrics": {},
  "error_rates": {},
  "last_updated": "$timestamp"
}
EOF
    fi
    
    # Initialize alerts file
    if [[ ! -f "$ALERTS_FILE" ]]; then
        cat > "$ALERTS_FILE" << EOF
{
  "timestamp": "$timestamp",
  "active_alerts": [],
  "alert_history": [],
  "total_alerts": 0,
  "last_updated": "$timestamp"
}
EOF
    fi
}

# Structured logging function
log_structured() {
    local level="$1"
    local component="$2"
    local message="$3"
    local details="${4:-{}}"
    
    if [[ "$STRUCTURED_LOGS" == "true" ]]; then
        local timestamp=$(date -Iseconds)
        local log_entry=$(jq -n \
            --arg timestamp "$timestamp" \
            --arg level "$level" \
            --arg component "$component" \
            --arg message "$message" \
            --argjson details "$details" \
            '{
                timestamp: $timestamp,
                level: $level,
                component: $component,
                message: $message,
                details: $details
            }')
        
        echo "$log_entry" >> "$MONITORING_DATA_DIR/monitoring.log"
    else
        # Fallback to regular logging
        case "$level" in
            "ERROR") log_error "[$component] $message" ;;
            "WARN") log_warning "[$component] $message" ;;
            "INFO") log_info "[$component] $message" ;;
            "DEBUG") log_debug "[$component] $message" ;;
            *) log_info "[$component] $message" ;;
        esac
    fi
}

# Alert management
create_alert() {
    local severity="$1"
    local component="$2"
    local message="$3"
    local details="${4:-{}}"
    
    local timestamp=$(date -Iseconds)
    local alert_id=$(date +%s)-$(head -c 4 /dev/urandom | od -A n -t x | tr -d '[:space:]')
    
    local new_alert=$(jq -n \
        --arg id "$alert_id" \
        --arg timestamp "$timestamp" \
        --arg severity "$severity" \
        --arg component "$component" \
        --arg message "$message" \
        --argjson details "$details" \
        --arg status "active" \
        '{
            id: $id,
            timestamp: $timestamp,
            severity: $severity,
            component: $component,
            message: $message,
            details: $details,
            status: $status
        }')
    
    # Add to alerts file
    local temp_file=$(mktemp)
    jq --argjson new_alert "$new_alert" '
        .active_alerts += [$new_alert] |
        .alert_history += [$new_alert] |
        .total_alerts += 1 |
        .last_updated = now | strftime("%Y-%m-%dT%H:%M:%SZ")
    ' "$ALERTS_FILE" > "$temp_file" && mv "$temp_file" "$ALERTS_FILE"
    
    # Log the alert
    log_structured "ALERT" "$component" "$message" "$details"

    # Send Telegram notification for critical and warning alerts
    if [[ "$severity" == "critical" ]] || [[ "$severity" == "warning" ]]; then
        send_telegram_health_alert "$severity" "$component" "$message" "$details"
    fi
    
    # Output to console
    if [[ "$severity" == "critical" ]]; then
        log_error "🚨 ALERT [$component] $message"
    elif [[ "$severity" == "warning" ]]; then
        log_warning "⚠️  ALERT [$component] $message"
    else
        log_info "ℹ️  ALERT [$component] $message"
    fi
}

# Agent health monitoring
monitor_agent_connectivity() {
    log_func_info "monitor_agent_connectivity" "Checking agent connectivity"
    
    local healthy_agents=0
    local unhealthy_agents=0
    local total_agents=0
    
    # Get all registered agents
    if [[ -f "$PROJECT_ROOT/.maf/agents.json" ]]; then
        local agents
        agents=$(jq -r '.agents[].id' "$PROJECT_ROOT/.maf/agents.json" 2>/dev/null || true)
        
        for agent_id in $agents; do
            if [[ -n "$agent_id" ]]; then
                ((total_agents++))
                
                # Check if agent session exists
                local session_name="maf-agent-$agent_id"
                if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
                    # Check if agent is responsive
                    if agent_health_check "$agent_id" &>/dev/null; then
                        ((healthy_agents++))
                        log_structured "DEBUG" "agent_monitor" "Agent healthy: $agent_id"
                    else
                        ((unhealthy_agents++))
                        create_alert "warning" "agent_connectivity" "Agent unresponsive: $agent_id" "{\"agent_id\": \"$agent_id\", \"session\": \"$session_name\"}"
                    fi
                else
                    ((unhealthy_agents++))
                    create_alert "critical" "agent_connectivity" "Agent session not found: $agent_id" "{\"agent_id\": \"$agent_id\", \"expected_session\": \"$session_name\"}"
                fi
            fi
        done
    fi
    
    # Update health status
    local temp_file=$(mktemp)
    local status="healthy"
    if [[ $unhealthy_agents -gt 0 ]]; then
        status="unhealthy"
    fi
    
    jq --arg status "$status" --argjson healthy "$healthy_agents" --argjson unhealthy "$unhealthy_agents" --argjson total "$total_agents" '
        .checks.agent_connectivity = $status |
        .agents = {
            healthy_count: $healthy,
            unhealthy_count: $unhealthy,
            total_count: $total,
            health_percentage: (if $total > 0 then ($healthy / $total * 100 | floor) else 0 end)
        }
    ' "$HEALTH_STATUS_FILE" > "$temp_file" && mv "$temp_file" "$HEALTH_STATUS_FILE"
    
    log_structured "INFO" "agent_connectivity" "Agent connectivity check completed" "{\"healthy\": $healthy_agents, \"unhealthy\": $unhealthy_agents, \"total\": $total_agents}"
    return 0
}

# Session integrity monitoring
monitor_session_integrity() {
    log_func_info "monitor_session_integrity" "Checking session integrity"
    
    local healthy_sessions=0
    local stale_sessions=0
    local orphaned_sessions=0
    local total_sessions=0
    
    # Get all MAF sessions
    local maf_sessions
    maf_sessions=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" | cut -d':' -f1 || true)
    
    for session_name in $maf_sessions; do
        if [[ -n "$session_name" ]]; then
            ((total_sessions++))
            
            # Check if session is orphaned (no corresponding agent in registry)
            local agent_id=${session_name#maf-agent-}
            if ! find_agent "$agent_id" &>/dev/null; then
                ((orphaned_sessions++))
                create_alert "warning" "session_integrity" "Orphaned session detected: $session_name" "{\"session\": \"$session_name\", \"agent_id\": \"$agent_id\"}"
            else
                ((healthy_sessions++))
            fi
        fi
    done
    
    # Update health status
    local temp_file=$(mktemp)
    local status="healthy"
    if [[ $stale_sessions -gt 0 ]] || [[ $orphaned_sessions -gt 0 ]]; then
        status="degraded"
    fi
    
    jq --arg status "$status" --argjson healthy "$healthy_sessions" --argjson stale "$stale_sessions" --argjson orphaned "$orphaned_sessions" --argjson total "$total_sessions" '
        .checks.session_integrity = $status |
        .sessions = {
            healthy_count: $healthy,
            stale_count: $stale,
            orphaned_count: $orphaned,
            total_count: $total
        }
    ' "$HEALTH_STATUS_FILE" > "$temp_file" && mv "$temp_file" "$HEALTH_STATUS_FILE"
    
    log_structured "INFO" "session_integrity" "Session integrity check completed" "{\"healthy\": $healthy_sessions, \"stale\": $stale_sessions, \"orphaned\": $orphaned_sessions, \"total\": $total_sessions}"
    return 0
}

# Resource utilization monitoring
monitor_resource_utilization() {
    log_func_info "monitor_resource_utilization" "Checking system resource utilization"
    
    # Get CPU usage
    local cpu_usage=0
    if command -v top &>/dev/null; then
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | cut -d'.' -f1 2>/dev/null || echo "0")
    fi
    
    # Get memory usage
    local mem_usage=0
    if command -v free &>/dev/null; then
        local mem_total=$(free -m | awk 'NR==2{print $2}')
        local mem_used=$(free -m | awk 'NR==2{print $3}')
        if [[ $mem_total -gt 0 ]]; then
            mem_usage=$(((mem_used * 100) / mem_total))
        fi
    fi
    
    # Get disk usage
    local disk_usage=0
    if command -v df &>/dev/null; then
        disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    fi
    
    # Get load average
    local load_avg="[]"
    if [[ -f "/proc/loadavg" ]]; then
        load_avg=$(cat /proc/loadavg | cut -d' ' -f1-3 | jq -R 'split(" ") | map(tonumber?)')
    fi
    
    # Check thresholds and create alerts
    local resource_status="healthy"
    
    if [[ $cpu_usage -gt $CPU_THRESHOLD ]]; then
        create_alert "warning" "resource_utilization" "High CPU usage detected" "{\"cpu_usage\": $cpu_usage, \"threshold\": $CPU_THRESHOLD}"
        resource_status="degraded"
    fi
    
    if [[ $mem_usage -gt $MEMORY_THRESHOLD ]]; then
        create_alert "warning" "resource_utilization" "High memory usage detected" "{\"memory_usage\": $mem_usage, \"threshold\": $MEMORY_THRESHOLD}"
        resource_status="degraded"
    fi
    
    if [[ $disk_usage -gt $DISK_THRESHOLD ]]; then
        create_alert "critical" "resource_utilization" "High disk usage detected" "{\"disk_usage\": $disk_usage, \"threshold\": $DISK_THRESHOLD}"
        resource_status="unhealthy"
    fi
    
    # Update health status
    local temp_file=$(mktemp)
    jq --arg status "$resource_status" --argjson cpu "$cpu_usage" --argjson mem "$mem_usage" --argjson disk "$disk_usage" --argjson load "$load_avg" '
        .checks.resource_utilization = $status |
        .system_metrics = {
            cpu_usage: $cpu,
            memory_usage: $mem,
            disk_usage: $disk,
            load_average: $load
        }
    ' "$HEALTH_STATUS_FILE" > "$temp_file" && mv "$temp_file" "$HEALTH_STATUS_FILE"
    
    log_structured "INFO" "resource_utilization" "Resource utilization check completed" "{\"cpu\": $cpu_usage, \"memory\": $mem_usage, \"disk\": $disk_usage, \"status\": \"$resource_status\"}"
    return 0
}

# Main health check orchestration
run_health_checks() {
    log_func_info "run_health_checks" "Running comprehensive health checks"
    
    # Update timestamp
    local temp_file=$(mktemp)
    jq --arg timestamp "$(date -Iseconds)" '.last_updated = $timestamp' "$HEALTH_STATUS_FILE" > "$temp_file" && mv "$temp_file" "$HEALTH_STATUS_FILE"
    
    # Run enabled health checks
    if [[ "$AGENT_CONNECTIVITY_CHECK" == "true" ]]; then
        monitor_agent_connectivity
    fi
    
    if [[ "$SESSION_INTEGRITY_CHECK" == "true" ]]; then
        monitor_session_integrity
    fi
    
    if [[ "$RESOURCE_UTILIZATION_CHECK" == "true" ]]; then
        monitor_resource_utilization
    fi
    
    if [[ "$NETWORK_CONNECTIVITY_CHECK" == "true" ]]; then
        if ! ping -c 1 8.8.8.8 &>/dev/null; then
            create_alert "warning" "network_connectivity" "Network connectivity issue detected"
        fi
    fi
    
    # Calculate overall health
    calculate_overall_health
    
    log_structured "INFO" "health_monitor" "Health checks completed"
    return 0
}

# Calculate overall system health
calculate_overall_health() {
    local temp_file=$(mktemp)
    
    # Determine overall status based on individual checks
    local overall_status=$(jq -r '
        [.checks[]] | 
        map(select(. == "unhealthy")) | 
        if length > 0 then "unhealthy" 
        else 
            [.checks[]] | 
            map(select(. == "degraded")) | 
            if length > 0 then "degraded" else "healthy" end 
        end
    ' "$HEALTH_STATUS_FILE")
    
    # Update overall status
    jq --arg status "$overall_status" '.overall_status = $status' "$HEALTH_STATUS_FILE" > "$temp_file" && mv "$temp_file" "$HEALTH_STATUS_FILE"
    
    log_structured "INFO" "health_monitor" "Overall system health: $overall_status"
}

# Monitoring daemon main loop
run_monitoring_daemon() {
    log_info "Starting MAF health monitoring daemon"
    
    # Write PID file
    echo $$ > "$PID_FILE"
    
    # Set up signal handlers for graceful shutdown
    trap 'log_info "Health monitoring daemon stopping"; rm -f "$PID_FILE"; exit 0' TERM INT
    
    # Main monitoring loop
    while true; do
        # Run comprehensive health checks
        run_health_checks
        
        # Sleep until next check
        sleep "$HEALTH_CHECK_INTERVAL"
    done
}

# Stop monitoring daemon
stop_monitoring_daemon() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping health monitoring daemon (PID: $pid)"
            kill "$pid"
            rm -f "$PID_FILE"
            log_success "Health monitoring daemon stopped"
        else
            log_warning "Health monitoring daemon PID file exists but process not running"
            rm -f "$PID_FILE"
        fi
    else
        log_info "Health monitoring daemon not running"
    fi
}

# Check if daemon is running
check_daemon_status() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Health monitoring daemon is running (PID: $pid)"
            return 0
        else
            log_warning "Health monitoring daemon PID file exists but process not running"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        log_info "Health monitoring daemon is not running"
        return 1
    fi
}

# Show current health status
show_health_status() {
    if [[ -f "$HEALTH_STATUS_FILE" ]]; then
        echo "Current MAF Health Status:"
        echo "=========================="
        
        local overall_status=$(jq -r '.overall_status' "$HEALTH_STATUS_FILE")
        local last_updated=$(jq -r '.last_updated' "$HEALTH_STATUS_FILE")
        
        echo "Overall Status: $overall_status"
        echo "Last Updated: $last_updated"
        echo
        
        echo "Health Checks:"
        jq -r '.checks | to_entries[] | "  \(.key): \(.value)"' "$HEALTH_STATUS_FILE"
        echo
        
        # Show active alerts if any
        local active_alerts=$(jq '.active_alerts | length' "$ALERTS_FILE")
        if [[ $active_alerts -gt 0 ]]; then
            echo "Active Alerts ($active_alerts):"
            jq -r '.active_alerts[] | "  [\(.severity|ascii_upcase)] \(.component): \(.message)"' "$ALERTS_FILE"
        fi
    else
        log_warning "Health status file not found. Run monitoring first."
    fi
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Initialize monitoring
    initialize_monitoring
    
    case "${1:-start}" in
        "start")
            if check_daemon_status; then
                log_warning "Health monitoring daemon is already running"
                exit 1
            fi
            run_monitoring_daemon
            ;;
        "stop")
            stop_monitoring_daemon
            ;;
        "restart")
            stop_monitoring_daemon
            sleep 2
            run_monitoring_daemon
            ;;
        "status")
            check_daemon_status
            show_health_status
            ;;
        "check")
            run_health_checks
            show_health_status
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|status|check}"
            echo "  start   - Start the monitoring daemon"
            echo "  stop    - Stop the monitoring daemon"
            echo "  restart - Restart the monitoring daemon"
            echo "  status  - Show daemon status and current health"
            echo "  check   - Run health checks once and show results"
            exit 1
            ;;
    esac
fi

# Telegram integration for health alerts
send_telegram_health_alert() {
    local severity="$1"
    local component="$2" 
    local message="$3"
    local details="${4:-{}}"
    
    # Check if Telegram integration is enabled in config
    local telegram_enabled=$(jq -r '.monitoring.telegram.enabled // false' "$CONFIG_FILE" 2>/dev/null || echo "false")
    local health_alerts_enabled=$(jq -r '.monitoring.telegram.integration.health_alerts // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
    
    if [[ "$telegram_enabled" != "true" ]] || [[ "$health_alerts_enabled" != "true" ]]; then
        return 0
    fi
    
    # Call Telegram integration script
    local telegram_script="$MONITORING_DIR/telegram-integration.mjs"
    if [[ -f "$telegram_script" ]]; then
        # Convert details to JSON string if not already
        if [[ "$details" == "{}" || -z "$details" ]]; then
            details_json='{"component":"'"$component"'"}'
        else
            details_json="$details"
        fi
        
        # Call the Telegram integration in background to avoid blocking
        node "$telegram_script" --test-health >/dev/null 2>&1 && \
        node -e "
        import('./telegram-integration.mjs').then(({ TelegramIntegration }) => {
            const integration = new TelegramIntegration();
            integration.handleHealthAlert('$component', '$severity', $details_json)
                .catch(err => console.warn('Telegram health alert failed:', err.message));
        }).catch(err => console.warn('Telegram integration error:', err.message));
        " &
        
        log_structured "INFO" "telegram_integration" "Telegram health alert queued" "{\"severity\": \"$severity\", \"component\": \"$component\"}"
    else
        log_structured "WARN" "telegram_integration" "Telegram integration script not found"
    fi
}

