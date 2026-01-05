#!/bin/bash
# ABOUTME: Shell script to setup cgroups configuration for MAF task resource limiting
# ABOUTME: Configures CPU, memory, and process limits for secure task execution

# Source MAF utilities and colors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAF_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source colors and utilities
if [ -f "${SCRIPT_DIR}/lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/lib/colors.sh"
else
    # Basic colors if lib/colors.sh not available
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Default values
TASK_ID=""
POLICY_FILE="${MAF_ROOT}/.maf/configs/security-policy.json"
PROFILE="restricted"
DRY_RUN=false
CLEANUP=false
LIST=false
VERBOSE=false

# Resource limits (default values)
DEFAULT_CPU_SHARES="1024"        # Relative CPU shares (1024 = 1 CPU)
DEFAULT_MEMORY_LIMIT="512M"      # Memory limit
DEFAULT_MAX_PROCESSES="10"       # Maximum processes
DEFAULT_IO_LIMIT="10M"           # I/O bandwidth limit

# Help message
show_help() {
    cat << EOHELP
MAF Cgroups Setup Script - Configure cgroups for task resource limiting

USAGE:
    setup-cgroups.sh [OPTIONS]

OPTIONS:
    -t, --task-id <id>           Task ID for cgroup (required for setup)
    -p, --policy-file <file>     Security policy file (default: .maf/configs/security-policy.json)
    --profile <profile>          Security profile to use (default: restricted)
    --cpu-shares <shares>        CPU shares (default: 1024)
    --memory-limit <limit>       Memory limit (default: 512M)
    --max-processes <count>      Maximum processes (default: 10)
    --io-limit <limit>           I/O bandwidth limit (default: 10M)
    --dry-run                    Show what would be configured without making changes
    --cleanup                    Remove cgroup for task
    --list                       List all MAF cgroups
    -v, --verbose                Enable verbose output
    -h, --help                   Show this help message

RESOURCE LIMITS:
    CPU Shares:       Relative CPU allocation (1024 = 1 CPU core equivalent)
    Memory Limit:     Maximum memory usage (e.g., 512M, 1G, 2G)
    Max Processes:    Maximum number of processes
    I/O Limit:        Maximum I/O bandwidth per second

EXAMPLES:
    # Setup cgroups for task with default profile
    ./setup-cgroups.sh --task-id task-123

    # Setup with custom resource limits
    ./setup-cgroups.sh --task-id task-456 --memory-limit 1G --cpu-shares 2048

    # List all MAF cgroups
    ./setup-cgroups.sh --list

    # Cleanup cgroup for task
    ./setup-cgroups.sh --task-id task-789 --cleanup

    # Dry run to preview configuration
    ./setup-cgroups.sh --task-id task-abc --dry-run

EXIT CODES:
    0   Cgroups configured successfully
    1   Error in cgroup configuration
    2   Required arguments missing
    3   Insufficient permissions

EOHELP
}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "[VERBOSE] $*"
    fi
}

# Check if cgroups are available and accessible
check_cgroups_support() {
    if [ ! -d /sys/fs/cgroup ]; then
        log_error "cgroups not available on this system"
        log_info "This script requires Linux with cgroups support"
        return 1
    fi
    
    if [ ! -r /sys/fs/cgroup ]; then
        log_error "Cannot read cgroups filesystem (insufficient permissions)"
        log_info "Try running with sudo: sudo $0 $*"
        return 1
    fi
    
    # Check cgroups version (v1 vs v2)
    if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
        CGROUP_VERSION="v2"
        log_verbose "Detected cgroups v2"
    else
        CGROUP_VERSION="v1"
        log_verbose "Detected cgroups v1"
    fi
    
    return 0
}

# List all MAF cgroups
list_maf_cgroups() {
    log_info "MAF Cgroups:"
    
    local maf_cgroups=$(find /sys/fs/cgroup -name "maf-*" -type d 2>/dev/null)
    
    if [ -z "$maf_cgroups" ]; then
        log_info "  No MAF cgroups found"
        return 0
    fi
    
    for cgroup_dir in $maf_cgroups; do
        local cgroup_name=$(basename "$cgroup_dir")
        local task_id=${cgroup_name#maf-}
        
        echo
        log_info "  Cgroup: $cgroup_name (Task: $task_id)"
        log_info "    Path: $cgroup_dir"
        
        # Show processes if any
        if [ -f "$cgroup_dir/cgroup.procs" ] && [ -s "$cgroup_dir/cgroup.procs" ]; then
            local proc_count=$(wc -l < "$cgroup_dir/cgroup.procs")
            log_info "    Processes: $proc_count"
        else
            log_info "    Processes: None"
        fi
        
        # Show memory usage if available
        if [ -f "$cgroup_dir/memory.usage_in_bytes" ]; then
            local memory_usage=$(cat "$cgroup_dir/memory.usage_in_bytes" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "unknown")
            log_info "    Memory: $memory_usage"
        elif [ -f "$cgroup_dir/memory.current" ]; then
            local memory_usage=$(cat "$cgroup_dir/memory.current" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "unknown")
            log_info "    Memory: $memory_usage"
        fi
        
        # Show CPU usage if available
        if [ -f "$cgroup_dir/cpuacct.usage" ]; then
            local cpu_usage=$(cat "$cgroup_dir/cpuacct.usage" 2>/dev/null)
            log_info "    CPU time: ${cpu_usage} nanoseconds"
        fi
    done
    
    echo
}

# Parse resource limits from security policy
parse_policy_limits() {
    local policy_file="$1"
    local profile="$2"
    
    if [ ! -f "$policy_file" ]; then
        log_warning "Security policy file not found: $policy_file"
        return 0
    fi
    
    # Extract resource limits from policy
    local resource_limits=$(jq -r ".profiles[\"$profile\"].resources" "$policy_file" 2>/dev/null)
    
    if [ "$resource_limits" = "null" ] || [ -z "$resource_limits" ]; then
        log_warning "Resource limits not found in profile '$profile', using defaults"
        return 0
    fi
    
    # Extract individual limits
    local max_memory_mb=$(echo "$resource_limits" | jq -r '.max_memory_mb // empty')
    local max_cpu_percent=$(echo "$resource_limits" | jq -r '.max_cpu_percent // empty')
    local max_processes=$(echo "$resource_limits" | jq -r '.max_processes // empty')
    local max_execution_time_sec=$(echo "$resource_limits" | jq -r '.max_execution_time_sec // empty')
    
    # Convert policy limits to cgroup values
    if [ -n "$max_memory_mb" ] && [ "$max_memory_mb" != "null" ]; then
        MEMORY_LIMIT="${max_memory_mb}M"
        log_verbose "Memory limit from policy: $MEMORY_LIMIT"
    fi
    
    if [ -n "$max_processes" ] && [ "$max_processes" != "null" ]; then
        MAX_PROCESSES="$max_processes"
        log_verbose "Max processes from policy: $MAX_PROCESSES"
    fi
    
    if [ -n "$max_cpu_percent" ] && [ "$max_cpu_percent" != "null" ]; then
        # Convert percentage to shares (1024 = 100%)
        CPU_SHARES=$(echo "scale=0; $max_cpu_percent * 1024 / 100" | bc 2>/dev/null || echo "1024")
        log_verbose "CPU shares from policy: $CPU_SHARES"
    fi
    
    return 0
}

# Create cgroup hierarchy for task
create_cgroup_hierarchy() {
    local task_id="$1"
    
    local cgroup_path="/sys/fs/cgroup/maf-$task_id"
    
    if [ "$DRY_RUN" = true ]; then
        log_verbose "DRY RUN: Would create cgroup: $cgroup_path"
        echo "$cgroup_path"
        return 0
    fi
    
    # Create main cgroup directory
    mkdir -p "$cgroup_path" 2>/dev/null || {
        log_error "Cannot create cgroup directory: $cgroup_path"
        log_info "This may require root privileges or systemd integration"
        return 1
    }
    
    log_verbose "Created cgroup directory: $cgroup_path"
    echo "$cgroup_path"
}

# Configure CPU limits
configure_cpu_limits() {
    local cgroup_path="$1"
    local cpu_shares="$2"
    
    log_verbose "Configuring CPU limits: $cpu_shares shares"
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        # cgroups v2 uses unified hierarchy
        if [ -f "$cgroup_path/cpu.max" ]; then
            # Set CPU bandwidth (100% max)
            echo "max 100000" > "$cgroup_path/cpu.max" 2>/dev/null || {
                log_warning "Cannot set CPU bandwidth (may need root)"
            }
        fi
        
        if [ -f "$cgroup_path/cpu.weight" ]; then
            # Set CPU weight (similar to shares)
            echo "$cpu_shares" > "$cgroup_path/cpu.weight" 2>/dev/null || {
                log_warning "Cannot set CPU weight (may need root)"
            }
        fi
    else
        # cgroups v1 uses separate hierarchies
        local cpu_path="${cgroup_path}/cpu,cpuacct"
        mkdir -p "$cpu_path" 2>/dev/null
        
        if [ -f "$cpu_path/cpu.shares" ]; then
            echo "$cpu_shares" > "$cpu_path/cpu.shares" 2>/dev/null || {
                log_warning "Cannot set CPU shares (may need root)"
            }
        fi
    fi
    
    return 0
}

# Configure memory limits
configure_memory_limits() {
    local cgroup_path="$1"
    local memory_limit="$2"
    
    log_verbose "Configuring memory limits: $memory_limit"
    
    # Convert memory limit to bytes
    local memory_bytes
    case "$memory_limit" in
        *K|*k)
            memory_bytes=$((${memory_limit%[Kk]} * 1024))
            ;;
        *M|m)
            memory_bytes=$((${memory_limit%[Mm]} * 1024 * 1024))
            ;;
        *G|g)
            memory_bytes=$((${memory_limit%[Gg]} * 1024 * 1024 * 1024))
            ;;
        *)
            memory_bytes="$memory_limit"
            ;;
    esac
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$cgroup_path/memory.max" ]; then
            echo "$memory_bytes" > "$cgroup_path/memory.max" 2>/dev/null || {
                log_warning "Cannot set memory limit (may need root)"
            }
        fi
    else
        local memory_path="${cgroup_path}/memory"
        mkdir -p "$memory_path" 2>/dev/null
        
        if [ -f "$memory_path/memory.limit_in_bytes" ]; then
            echo "$memory_bytes" > "$memory_path/memory.limit_in_bytes" 2>/dev/null || {
                log_warning "Cannot set memory limit (may need root)"
            }
        fi
    fi
    
    return 0
}

# Configure process limits
configure_process_limits() {
    local cgroup_path="$1"
    local max_processes="$2"
    
    log_verbose "Configuring process limits: $max_processes"
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$cgroup_path/pids.max" ]; then
            echo "$max_processes" > "$cgroup_path/pids.max" 2>/dev/null || {
                log_warning "Cannot set process limit (may need root)"
            }
        fi
    else
        local pids_path="${cgroup_path}/pids"
        mkdir -p "$pids_path" 2>/dev/null
        
        if [ -f "$pids_path/pids.max" ]; then
            echo "$max_processes" > "$pids_path/pids.max" 2>/dev/null || {
                log_warning "Cannot set process limit (may need root)"
            }
        fi
    fi
    
    return 0
}

# Configure I/O limits
configure_io_limits() {
    local cgroup_path="$1"
    local io_limit="$2"
    
    log_verbose "Configuring I/O limits: $io_limit"
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$cgroup_path/io.max" ]; then
            # Set I/O limit for all devices (simplified)
            # Format: major:minor rbps=limit wbps=limit
            echo "8:0 rbps=$io_limit wbps=$io_limit" > "$cgroup_path/io.max" 2>/dev/null || {
                log_warning "Cannot set I/O limit (may need root or specific device)"
            }
        fi
    else
        local blkio_path="${cgroup_path}/blkio"
        mkdir -p "$blkio_path" 2>/dev/null
        
        if [ -f "$blkio_path/blkio.throttle.read_bps_device" ]; then
            # Set read limit for all devices
            echo "8:0 $io_limit" > "$blkio_path/blkio.throttle.read_bps_device" 2>/dev/null || {
                log_warning "Cannot set I/O read limit (may need root or specific device)"
            }
        fi
        
        if [ -f "$blkio_path/blkio.throttle.write_bps_device" ]; then
            # Set write limit for all devices
            echo "8:0 $io_limit" > "$blkio_path/blkio.throttle.write_bps_device" 2>/dev/null || {
                log_warning "Cannot set I/O write limit (may need root or specific device)"
            }
        fi
    fi
    
    return 0
}

# Add process to cgroup
add_process_to_cgroup() {
    local cgroup_path="$1"
    local pid="$2"
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$cgroup_path/cgroup.procs" ]; then
            echo "$pid" > "$cgroup_path/cgroup.procs" 2>/dev/null || {
                log_warning "Cannot add process $pid to cgroup (may need root)"
                return 1
            }
        fi
    else
        # cgroups v1 - add to all relevant controllers
        local controllers="cpu,cpuacct memory pids blkio"
        for controller in $controllers; do
            local controller_path="${cgroup_path}/${controller}"
            if [ -d "$controller_path" ] && [ -f "$controller_path/tasks" ]; then
                echo "$pid" > "$controller_path/tasks" 2>/dev/null || true
            fi
        done
    fi
    
    return 0
}

# Generate cgroup management script
generate_management_script() {
    local task_id="$1"
    local cgroup_path="$2"
    
    local script_path="/tmp/maf-cgroup-manager-${task_id}.sh"
    
    local script_content='#!/bin/bash
# ABOUTME: Cgroup management script for MAF task: '$task_id'
# ABOUTME: Provides utilities to manage task resource limits

TASK_ID="'$task_id'"
CGROUP_PATH="'$cgroup_path'"
CGROUP_VERSION="'$CGROUP_VERSION'"

# Add current process to cgroup
add_current_process() {
    local pid=$$
    echo "Adding current process (PID: $pid) to cgroup..."
    
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$CGROUP_PATH/cgroup.procs" ]; then
            echo "$pid" > "$CGROUP_PATH/cgroup.procs" 2>/dev/null || {
                echo "ERROR: Cannot add process to cgroup (may need root)"
                return 1
            }
        fi
    else
        local controllers="cpu,cpuacct memory pids blkio"
        for controller in $controllers; do
            local controller_path="${CGROUP_PATH}/${controller}"
            if [ -d "$controller_path" ] && [ -f "$controller_path/tasks" ]; then
                echo "$pid" > "$controller_path/tasks" 2>/dev/null || true
            fi
        done
    fi
    
    echo "✓ Process added to cgroup"
}

# Show cgroup statistics
show_stats() {
    echo "MAF Cgroup Statistics for Task: $TASK_ID"
    echo "========================================"
    echo "Cgroup Path: $CGROUP_PATH"
    echo "Cgroup Version: $CGROUP_VERSION"
    echo ""
    
    # Process count
    if [ -f "$CGROUP_PATH/cgroup.procs" ]; then
        local proc_count=$(wc -l < "$CGROUP_PATH/cgroup.procs" 2>/dev/null || echo "0")
        echo "Processes: $proc_count"
        if [ "$proc_count" -gt 0 ]; then
            echo "PIDs:"
            cat "$CGROUP_PATH/cgroup.procs" 2>/dev/null | sed "s/^/  /"
        fi
    fi
    
    # Memory usage
    if [ "$CGROUP_VERSION" = "v2" ]; then
        if [ -f "$CGROUP_PATH/memory.current" ]; then
            local memory_current=$(cat "$CGROUP_PATH/memory.current" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "unknown")
            echo "Memory Used: $memory_current"
        fi
        if [ -f "$CGROUP_PATH/memory.max" ]; then
            local memory_max=$(cat "$CGROUP_PATH/memory.max" 2>/dev/null)
            if [ "$memory_max" = "max" ]; then
                echo "Memory Limit: unlimited"
            else
                memory_max=$(echo "$memory_max" | numfmt --to=iec 2>/dev/null || echo "$memory_max")
                echo "Memory Limit: $memory_max"
            fi
        fi
    else
        if [ -f "$CGROUP_PATH/memory/memory.usage_in_bytes" ]; then
            local memory_usage=$(cat "$CGROUP_PATH/memory/memory.usage_in_bytes" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "unknown")
            echo "Memory Used: $memory_usage"
        fi
        if [ -f "$CGROUP_PATH/memory/memory.limit_in_bytes" ]; then
            local memory_limit=$(cat "$CGROUP_PATH/memory/memory.limit_in_bytes" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "unknown")
            echo "Memory Limit: $memory_limit"
        fi
    fi
    
    # CPU usage
    if [ -f "$CGROUP_PATH/cpuacct.usage" ]; then
        local cpu_usage=$(cat "$CGROUP_PATH/cpuacct.usage" 2>/dev/null)
        local cpu_seconds=$((cpu_usage / 1000000000))
        echo "CPU Time: ${cpu_seconds}s"
    fi
}

# Clean up cgroup
cleanup() {
    echo "Cleaning up cgroup for task: $TASK_ID"
    
    # Move all processes to root cgroup
    if [ -f "$CGROUP_PATH/cgroup.procs" ]; then
        while read -r pid; do
            echo "$pid" > /sys/fs/cgroup/cgroup.procs 2>/dev/null || true
        done < "$CGROUP_PATH/cgroup.procs"
    fi
    
    # Remove cgroup directory
    if [ -d "$CGROUP_PATH" ]; then
        rmdir "$CGROUP_PATH" 2>/dev/null || {
            echo "WARNING: Cannot remove cgroup directory (may need root)"
            return 1
        }
    fi
    
    echo "✓ Cgroup cleaned up"
}

# Command interface
case "${1:-help}" in
    "add"|"join")
        add_current_process
        ;;
    "stats"|"status")
        show_stats
        ;;
    "cleanup"|"remove")
        cleanup
        ;;
    "help"|*)
        echo "MAF Cgroup Manager for Task: $TASK_ID"
        echo ""
        echo "Commands:"
        echo "  add      - Add current process to cgroup"
        echo "  stats    - Show cgroup statistics"
        echo "  cleanup  - Remove cgroup"
        echo "  help     - Show this help"
        echo ""
        echo "Usage:"
        echo "  source $0     # To source in current shell"
        echo "  $0 add         # Add current process"
        echo "  $0 stats       # Show statistics"
        echo "  $0 cleanup     # Clean up cgroup"
        ;;
esac'
    
    if [ "$DRY_RUN" = true ]; then
        log_verbose "DRY RUN: Would create management script: $script_path"
    else
        echo "$script_content" > "$script_path" || {
            log_error "Failed to create management script: $script_path"
            return 1
        }
        chmod +x "$script_path"
        log_success "Generated management script: $script_path"
    fi
}

# Cleanup cgroup for task
cleanup_cgroup() {
    local task_id="$1"
    local cgroup_path="/sys/fs/cgroup/maf-$task_id"
    
    if [ ! -d "$cgroup_path" ]; then
        log_warning "Cgroup not found for task: $task_id"
        return 0
    fi
    
    log_info "Cleaning up cgroup for task: $task_id"
    
    if [ "$DRY_RUN" = true ]; then
        log_verbose "DRY RUN: Would remove cgroup: $cgroup_path"
        return 0
    fi
    
    # Move all processes to root cgroup first
    if [ -f "$cgroup_path/cgroup.procs" ]; then
        local proc_count=$(wc -l < "$cgroup_path/cgroup.procs" 2>/dev/null || echo "0")
        if [ "$proc_count" -gt 0 ]; then
            log_warning "Moving $proc_count processes to root cgroup"
            while read -r pid; do
                echo "$pid" > /sys/fs/cgroup/cgroup.procs 2>/dev/null || true
            done < "$cgroup_path/cgroup.procs"
        fi
    fi
    
    # Remove cgroup directory
    rmdir "$cgroup_path" 2>/dev/null || {
        log_error "Cannot remove cgroup directory (may need root or processes still running)"
        return 1
    }
    
    log_success "Cgroup cleaned up successfully"
    
    # Remove management script if exists
    local script_path="/tmp/maf-cgroup-manager-${task_id}.sh"
    if [ -f "$script_path" ]; then
        rm -f "$script_path"
        log_verbose "Removed management script: $script_path"
    fi
    
    return 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--task-id)
                TASK_ID="$2"
                shift 2
                ;;
            -p|--policy-file)
                POLICY_FILE="$2"
                shift 2
                ;;
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            --cpu-shares)
                CPU_SHARES="$2"
                shift 2
                ;;
            --memory-limit)
                MEMORY_LIMIT="$2"
                shift 2
                ;;
            --max-processes)
                MAX_PROCESSES="$2"
                shift 2
                ;;
            --io-limit)
                IO_LIMIT="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --cleanup)
                CLEANUP=true
                shift
                ;;
            --list)
                LIST=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 3
                ;;
        esac
    done
}

# Main function
main() {
    parse_args "$@"
    
    # Check cgroups support
    if ! check_cgroups_support; then
        exit 1
    fi
    
    # Handle list command
    if [ "$LIST" = true ]; then
        list_maf_cgroups
        exit 0
    fi
    
    # Handle cleanup command
    if [ "$CLEANUP" = true ]; then
        if [ -z "$TASK_ID" ]; then
            log_error "Task ID is required for cleanup. Use --task-id <id>"
            exit 2
        fi
        cleanup_cgroup "$TASK_ID"
        exit $?
    fi
    
    # Validate required arguments for setup
    if [ -z "$TASK_ID" ]; then
        log_error "Task ID is required for setup. Use --task-id <id>"
        show_help
        exit 2
    fi
    
    log_info "MAF Cgroups Setup Script v1.0.0"
    log_info "Setting up cgroups for task: $TASK_ID"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN MODE - No changes will be made"
    fi
    
    echo
    
    # Parse policy limits
    parse_policy_limits "$POLICY_FILE" "$PROFILE"
    
    # Set defaults if not specified
    CPU_SHARES="${CPU_SHARES:-$DEFAULT_CPU_SHARES}"
    MEMORY_LIMIT="${MEMORY_LIMIT:-$DEFAULT_MEMORY_LIMIT}"
    MAX_PROCESSES="${MAX_PROCESSES:-$DEFAULT_MAX_PROCESSES}"
    IO_LIMIT="${IO_LIMIT:-$DEFAULT_IO_LIMIT}"
    
    log_verbose "Configuration:"
    log_verbose "  CPU Shares: $CPU_SHARES"
    log_verbose "  Memory Limit: $MEMORY_LIMIT"
    log_verbose "  Max Processes: $MAX_PROCESSES"
    log_verbose "  I/O Limit: $IO_LIMIT"
    echo
    
    # Create cgroup hierarchy
    local cgroup_path=$(create_cgroup_hierarchy "$TASK_ID")
    if [ $? -ne 0 ]; then
        exit 1
    fi
    
    # Configure resource limits
    configure_cpu_limits "$cgroup_path" "$CPU_SHARES"
    configure_memory_limits "$cgroup_path" "$MEMORY_LIMIT"
    configure_process_limits "$cgroup_path" "$MAX_PROCESSES"
    configure_io_limits "$cgroup_path" "$IO_LIMIT"
    
    # Generate management script
    generate_management_script "$TASK_ID" "$cgroup_path"
    
    # Summary
    echo
    log_info "Cgroups Setup Summary:"
    log_info "  Task ID: $TASK_ID"
    log_info "  Profile: $PROFILE"
    log_info "  Cgroup Path: $cgroup_path"
    log_info "  CPU Shares: $CPU_SHARES"
    log_info "  Memory Limit: $MEMORY_LIMIT"
    log_info "  Max Processes: $MAX_PROCESSES"
    log_info "  I/O Limit: $IO_LIMIT"
    
    if [ "$DRY_RUN" = false ]; then
        echo
        log_success "Cgroups configured successfully!"
        echo
        log_info "To use these cgroups:"
        log_info "  1. Source the management script: source /tmp/maf-cgroup-manager-${TASK_ID}.sh"
        log_info "  2. Add your process: ./maf-cgroup-manager-${TASK_ID}.sh add"
        log_info "  3. Monitor resources: ./maf-cgroup-manager-${TASK_ID}.sh stats"
        log_info "  4. Cleanup when done: ./maf-cgroup-manager-${TASK_ID}.sh cleanup"
        echo
        log_info "Or add processes directly:"
        log_info "  echo \$\$ > $cgroup_path/cgroup.procs"
        echo
    fi
    
    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
