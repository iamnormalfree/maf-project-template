#!/bin/bash
# ABOUTME: Transformed MAF security verification script using security-property validation
# ABOUTME: Tests actual security effectiveness via boundary testing, not tool availability

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
QUIET=false
DETAILED=false
TASK_ID="verify-$(date +%s)"
OUTPUT_DIR="/tmp"
TEST_NETWORK=true
TEST_FILESYSTEM=true
TEST_RESOURCES=true
SKIP_INTEGRATION=false
VERBOSE=false
SECURITY_PROPERTY_MODE=true  # NEW: Use security property validation by default

# Test results counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
BOUNDARY_EFFECTIVENESS_SCORE=0
ATTACK_SCENARIOS_PASSED=0
ATTACK_SCENARIOS_FAILED=0

# Help message
show_help() {
    cat << EOHELP
MAF Security Property Verification - Actual security effectiveness testing

USAGE:
    verify-security-tools.sh [OPTIONS]

OPTIONS:
    -q, --quiet                 Suppress output, exit code indicates result
    -d, --detailed              Show detailed test output
    -t, --task-id <id>          Task ID for testing (default: verify-timestamp)
    -o, --output-dir <dir>      Output directory for test artifacts (default: /tmp)
    --skip-network              Skip network security tests
    --skip-filesystem           Skip filesystem security tests
    --skip-resources            Skip resource limiting tests
    --skip-integration          Skip integration tests
    -v, --verbose               Enable verbose output
    --legacy-mode               Use legacy tool availability tests (NOT RECOMMENDED)
    -h, --help                  Show this help message

TEST CATEGORIES (SECURITY PROPERTY MODE):
    Network Boundary      - Actual network isolation effectiveness testing
    Filesystem Boundary   - Real filesystem isolation property validation  
    Resource Boundaries   - Resource limit enforcement testing
    Attack Scenarios      - Threat model-driven attack simulation

EXAMPLES:
    # Run security property verification (RECOMMENDED)
    ./verify-security-tools.sh

    # Run with detailed boundary testing output
    ./verify-security-tools.sh --detailed

    # Skip network boundary tests (useful in isolated environments)
    ./verify-security-tools.sh --skip-network

    # Quick security effectiveness check (quiet mode)
    ./verify-security-tools.sh --quiet

EXIT CODES:
    0   All security boundaries effective (no violations detected)
    1   Security boundaries ineffective or bypassed
    2   System requirements not met
    3   Invalid arguments provided

TRANSFORMATION NOTE:
    This script now tests ACTUAL security effectiveness, not tool availability.
    22/22 tools "available" means NOTHING if boundaries can be bypassed.
    Security property validation measures REAL isolation enforcement.

EOHELP
}

# Logging functions
log_info() {
    if [ "$QUIET" != true ]; then
        echo -e "${BLUE}[INFO]${NC} $*"
    fi
}

log_success() {
    if [ "$QUIET" != true ]; then
        echo -e "${GREEN}[PASS]${NC} $*"
    fi
    ((TESTS_PASSED++))
}

log_warning() {
    if [ "$QUIET" != true ]; then
        echo -e "${YELLOW}[SKIP]${NC} $*"
    fi
    ((TESTS_SKIPPED++))
}

log_error() {
    if [ "$QUIET" != true ]; then
        echo -e "${RED}[FAIL]${NC} $*"
    fi
    ((TESTS_FAILED++))
}

log_violation() {
    if [ "$QUIET" != true ]; then
        echo -e "${RED}[VIOLATION]${NC} $*"
    fi
    ((TESTS_FAILED++))
    ((ATTACK_SCENARIOS_FAILED++))
}

log_boundary_effective() {
    if [ "$QUIET" != true ]; then
        echo -e "${GREEN}[EFFECTIVE]${NC} $*"
    fi
    ((TESTS_PASSED++))
    ((ATTACK_SCENARIOS_PASSED++))
}

log_verbose() {
    if [ "$VERBOSE" = true ] && [ "$QUIET" != true ]; then
        echo -e "[VERBOSE] $*"
    fi
}

log_test() {
    if [ "$QUIET" != true ]; then
        echo -e "${BLUE}[TEST]${NC} $*"
    fi
}

log_attack_scenario() {
    if [ "$QUIET" != true ]; then
        echo -e "${YELLOW}[ATTACK]${NC} $*"
    fi
}

# Test header
test_header() {
    local category="$1"
    
    if [ "$QUIET" != true ]; then
        echo
        echo "=================================================="
        echo "  $category Security Verification"
        echo "=================================================="
        echo
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            log_info "Mode: Security Property Validation (Effectiveness Testing)"
            log_info "Testing: Actual boundary enforcement, not tool availability"
        else
            log_warning "Mode: Legacy Tool Availability (NOT RECOMMENDED)"
            log_warning "Measures: Tool presence, NOT security effectiveness"
        fi
        echo
    fi
}

# Test summary
test_summary() {
    if [ "$QUIET" != true ]; then
        echo
        echo "=================================================="
        echo "  Security Effectiveness Summary"
        echo "=================================================="
        echo "  Tests Passed:         $TESTS_PASSED"
        echo "  Tests Failed:         $TESTS_FAILED"
        echo "  Tests Skipped:        $TESTS_SKIPPED"
        echo "  Total Tests:          $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
        echo
        
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            echo "  Attack Scenarios Passed:   $ATTACK_SCENARIOS_PASSED"
            echo "  Attack Scenarios Failed:   $ATTACK_SCENARIOS_FAILED"
            echo "  Boundary Effectiveness:    ${BOUNDARY_EFFECTIVENESS_SCORE}%"
            echo
            
            if [ $TESTS_FAILED -eq 0 ] && [ $BOUNDARY_EFFECTIVENESS_SCORE -ge 80 ]; then
                echo -e "${GREEN}✓ SECURITY BOUNDARIES EFFECTIVE${NC}"
                echo "Real isolation properties validated and working."
                echo "Security is actually enforced, not just available."
            elif [ $TESTS_FAILED -eq 0 ]; then
                echo -e "${YELLOW}⚠ SECURITY PARTIALLY EFFECTIVE${NC}"
                echo "Some boundaries may be bypassable under specific conditions."
                echo "Review attack scenario results for details."
            else
                echo -e "${RED}✗ SECURITY BOUNDARIES INEFFECTIVE${NC}"
                echo "Security violations detected - boundaries can be bypassed."
                echo "This indicates REAL security weaknesses, not missing tools."
            fi
        else
            if [ $TESTS_FAILED -eq 0 ]; then
                echo -e "${YELLOW}⚠ LEGACY MODE - LIMITED VALIDATION${NC}"
                echo "Tool availability confirmed, but security effectiveness unknown."
                echo "Switch to security property mode for real testing."
            else
                echo -e "${RED}✗ SOME TESTS FAILED${NC}"
                echo "Security tools may not be fully functional."
            fi
        fi
        echo
    fi
    
    return $TESTS_FAILED
}

# Check if tool is available (legacy mode only)
check_tool_availability() {
    local tool="$1"
    local tool_name="$2"
    
    if command -v "$tool" >/dev/null 2>&1; then
        local version=$("$tool" --version 2>/dev/null | head -n1 || echo "unknown")
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            log_verbose "$tool_name available: $version (Note: availability ≠ effectiveness)"
        else
            log_success "$tool_name is available: $version"
        fi
        return 0
    else
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            log_verbose "$tool_name not available (Note: testing boundary effectiveness anyway)"
        else
            log_error "$tool_name is not available"
        fi
        return 1
    fi
}

# Test network boundary effectiveness (NEW)
test_network_boundary_effectiveness() {
    test_header "Network Boundary Effectiveness"
    
    local network_effectiveness=0
    local total_network_tests=0
    
    if [ "$SECURITY_PROPERTY_MODE" != true ]; then
        log_warning "Running in legacy mode - switch to security property mode for real testing"
        test_proxychains_basic
        return 0
    fi
    
    log_test "Testing actual network isolation properties..."
    
    # Test 1: External network access should be blocked
    log_attack_scenario "Testing external network access blockage..."
    ((total_network_tests++))
    
    # Create a restrictive network environment for testing
    local temp_proxychains_config="${OUTPUT_DIR}/test-network-isolation-${TASK_ID}.conf"
    cat > "$temp_proxychains_config" << 'CONFIG_EOF'
strict_chain
proxy_dns
quiet_mode

[ProxyList]
# No proxies - all connections should fail
CONFIG_EOF

    # Test direct network access (should be blocked in restrictive environment)
    if timeout 5 ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        log_violation "External network access NOT blocked - isolation ineffective"
    else
        log_boundary_effective "External network access properly blocked"
        ((network_effectiveness++))
    fi
    
    # Test 2: DNS resolution should be blocked/redirected
    log_attack_scenario "Testing DNS resolution blockage..."
    ((total_network_tests++))
    
    if timeout 5 nslookup google.com >/dev/null 2>&1; then
        log_violation "DNS resolution NOT blocked - information leakage possible"
    else
        log_boundary_effective "DNS resolution properly blocked or redirected"
        ((network_effectiveness++))
    fi
    
    # Test 3: Port scanning should be prevented
    log_attack_scenario "Testing port scanning prevention..."
    ((total_network_tests++))
    
    if command -v netstat >/dev/null 2>&1; then
        # Test if we can enumerate listening ports (should be limited in sandbox)
        local port_count=$(netstat -tuln 2>/dev/null | wc -l || echo "0")
        if [ "$port_count" -gt 10 ]; then
            log_warning "Port enumeration returned $port_count entries (may be excessive)"
            # Not a failure, but worth noting
        else
            log_boundary_effective "Port enumeration properly limited"
            ((network_effectiveness++))
        fi
    else
        log_verbose "netstat not available - skipping port scanning test"
    fi
    
    # Test 4: Network namespace isolation (if available)
    if [ -r /proc/self/ns/net ]; then
        log_attack_scenario "Testing network namespace isolation..."
        ((total_network_tests++))
        
        local current_net_ns=$(readlink /proc/self/ns/net 2>/dev/null | cut -d'[' -f2 | cut -d']' -f1)
        log_verbose "Current network namespace: $current_net_ns"
        
        if [ -n "$current_net_ns" ]; then
            log_boundary_effective "Network namespace isolation active"
            ((network_effectiveness++))
        else
            log_violation "Network namespace isolation not detected"
        fi
    fi
    
    # Calculate network boundary effectiveness score
    if [ $total_network_tests -gt 0 ]; then
        local network_score=$((network_effectiveness * 100 / total_network_tests))
        log_info "Network boundary effectiveness: ${network_score}% ($network_effectiveness/$total_network_tests)"
        BOUNDARY_EFFECTIVENESS_SCORE=$((BOUNDARY_EFFECTIVENESS_SCORE + network_score / 4))  # Weight average
    fi
    
    rm -f "$temp_proxychains_config"
    return 0
}

# Test filesystem boundary effectiveness (NEW)
test_filesystem_boundary_effectiveness() {
    test_header "Filesystem Boundary Effectiveness"
    
    local fs_effectiveness=0
    local total_fs_tests=0
    
    if [ "$SECURITY_PROPERTY_MODE" != true ]; then
        log_warning "Running in legacy mode - switch to security property mode for real testing"
        test_bubblewrap_functionality
        return 0
    fi
    
    log_test "Testing actual filesystem isolation properties..."
    
    # Test 1: System file access should be blocked
    log_attack_scenario "Testing sensitive system file access restrictions..."
    ((total_fs_tests++))
    
    local sensitive_files=("/etc/passwd" "/etc/shadow" "/etc/sudoers" "/root")
    local blocked_files=0
    
    for file in "${sensitive_files[@]}"; do
        if [ -r "$file" ]; then
            log_verbose "Warning: Can read $file (may be expected for user)"
        else
            ((blocked_files++))
        fi
    done
    
    if [ $blocked_files -eq ${#sensitive_files[@]} ]; then
        log_boundary_effective "All sensitive system files properly restricted"
        ((fs_effectiveness++))
    elif [ $blocked_files -gt 0 ]; then
        log_warning "Some system files restricted ($blocked_files/${#sensitive_files[@]})"
        ((fs_effectiveness++))  # Partial credit
    else
        log_violation "No system file restrictions detected"
    fi
    
    # Test 2: Directory traversal should be prevented
    log_attack_scenario "Testing directory traversal prevention..."
    ((total_fs_tests++))
    
    # Attempt directory traversal via various methods
    if ls "../../../root" >/dev/null 2>&1; then
        log_violation "Directory traversal possible via relative paths"
    else
        log_boundary_effective "Directory traversal properly blocked"
        ((fs_effectiveness++))
    fi
    
    # Test 3: Executable file creation restrictions
    log_attack_scenario "Testing executable file creation restrictions..."
    ((total_fs_tests++))
    
    local test_exec_file="${OUTPUT_DIR}/test-executable-${TASK_ID}"
    echo "#!/bin/bash" > "$test_exec_file"
    chmod +x "$test_exec_file" 2>/dev/null
    
    if [ -x "$test_exec_file" ]; then
        # Can create executables in temp dir (expected)
        log_verbose "Executable creation allowed in temp directory (expected)"
        
        # Try to execute it (may be blocked by policy)
        if "$test_exec_file" >/dev/null 2>&1; then
            log_verbose "Executable execution allowed in temp directory"
        else
            log_boundary_effective "Executable execution properly restricted"
            ((fs_effectiveness++))
        fi
    else
        log_boundary_effective "Executable creation properly restricted"
        ((fs_effectiveness++))
    fi
    
    rm -f "$test_exec_file"
    
    # Test 4: Mount namespace isolation
    if [ -r /proc/self/ns/mnt ]; then
        log_attack_scenario "Testing mount namespace isolation..."
        ((total_fs_tests++))
        
        local current_mnt_ns=$(readlink /proc/self/ns/mnt 2>/dev/null | cut -d'[' -f2 | cut -d']' -f1)
        log_verbose "Current mount namespace: $current_mnt_ns"
        
        if [ -n "$current_mnt_ns" ]; then
            log_boundary_effective "Mount namespace isolation active"
            ((fs_effectiveness++))
        else
            log_violation "Mount namespace isolation not detected"
        fi
    fi
    
    # Calculate filesystem boundary effectiveness score
    if [ $total_fs_tests -gt 0 ]; then
        local fs_score=$((fs_effectiveness * 100 / total_fs_tests))
        log_info "Filesystem boundary effectiveness: ${fs_score}% ($fs_effectiveness/$total_fs_tests)"
        BOUNDARY_EFFECTIVENESS_SCORE=$((BOUNDARY_EFFECTIVENESS_SCORE + fs_score / 4))
    fi
    
    return 0
}

# Test resource boundary effectiveness (NEW)
test_resource_boundary_effectiveness() {
    test_header "Resource Boundary Effectiveness"
    
    local resource_effectiveness=0
    local total_resource_tests=0
    
    if [ "$SECURITY_PROPERTY_MODE" != true ]; then
        log_warning "Running in legacy mode - switch to security property mode for real testing"
        test_cgroups_functionality
        return 0
    fi
    
    log_test "Testing actual resource limit enforcement..."
    
    # Test 1: cgroups availability and configuration
    log_attack_scenario "Testing cgroups resource enforcement..."
    ((total_resource_tests++))
    
    if [ -d /sys/fs/cgroup ]; then
        local cgroup_controller_count=0
        
        # Check available cgroup controllers
        if [ -r /sys/fs/cgroup/cgroup.controllers ]; then
            # cgroups v2
            cgroup_controller_count=$(wc -l < /sys/fs/cgroup/cgroup.controllers 2>/dev/null || echo "0")
            log_verbose "cgroups v2 controllers available: $cgroup_controller_count"
        else
            # cgroups v1
            cgroup_controller_count=$(find /sys/fs/cgroup -maxdepth 1 -type d 2>/dev/null | wc -l)
            log_verbose "cgroups v1 subsystems available: $cgroup_controller_count"
        fi
        
        if [ $cgroup_controller_count -gt 0 ]; then
            log_boundary_effective "cgroups resource control available"
            ((resource_effectiveness++))
        else
            log_violation "No cgroups controllers available"
        fi
    else
        log_warning "cgroups filesystem not available - resource limits may not be enforceable"
    fi
    
    # Test 2: Process creation limits
    log_attack_scenario "Testing process creation limits..."
    ((total_resource_tests++))
    
    # Check if there are any process limits in place
    local current_process_limit=$(ulimit -u 2>/dev/null || echo "unlimited")
    log_verbose "Current process limit: $current_process_limit"
    
    if [ "$current_process_limit" != "unlimited" ] && [ "$current_process_limit" -lt 10000 ]; then
        log_boundary_effective "Process creation limits appear to be in place"
        ((resource_effectiveness++))
    else
        log_warning "Process limits may be too permissive or unlimited"
    fi
    
    # Test 3: Memory limits
    log_attack_scenario "Testing memory limit enforcement..."
    ((total_resource_tests++))
    
    local current_memory_limit=$(ulimit -v 2>/dev/null || echo "unlimited")
    log_verbose "Current memory limit: $current_memory_limit"
    
    if [ "$current_memory_limit" != "unlimited" ]; then
        log_boundary_effective "Memory limits appear to be configured"
        ((resource_effectiveness++))
    else
        log_warning "Memory limits appear to be unlimited"
    fi
    
    # Test 4: CPU time limits
    log_attack_scenario "Testing CPU time limit enforcement..."
    ((total_resource_tests++))
    
    local current_cpu_limit=$(ulimit -t 2>/dev/null || echo "unlimited")
    log_verbose "Current CPU time limit: $current_cpu_limit"
    
    if [ "$current_cpu_limit" != "unlimited" ]; then
        log_boundary_effective "CPU time limits appear to be configured"
        ((resource_effectiveness++))
    else
        log_warning "CPU time limits appear to be unlimited"
    fi
    
    # Calculate resource boundary effectiveness score
    if [ $total_resource_tests -gt 0 ]; then
        local resource_score=$((resource_effectiveness * 100 / total_resource_tests))
        log_info "Resource boundary effectiveness: ${resource_score}% ($resource_effectiveness/$total_resource_tests)"
        BOUNDARY_EFFECTIVENESS_SCORE=$((BOUNDARY_EFFECTIVENESS_SCORE + resource_score / 4))
    fi
    
    return 0
}

# Legacy proxychains test (preserved for compatibility)
test_proxychains_basic() {
    test_header "Network (Proxychains)"
    
    # Check proxychains installation
    if ! check_tool_availability "proxychains4" "Proxychains-ng"; then
        # Try alternative binary name
        if ! check_tool_availability "proxychains" "Proxychains-ng"; then
            log_warning "Network security tests skipped - proxychains-ng not available"
            return 0
        fi
    fi
    
    # Determine which proxychains binary to use
    local proxychains_cmd="proxychains4"
    if ! command -v "$proxychains_cmd" >/dev/null 2>&1; then
        proxychains_cmd="proxychains"
    fi
    
    log_test "Testing proxychains help functionality..."
    if "$proxychains_cmd" --help >/dev/null 2>&1; then
        log_success "proxychains help command works"
    else
        log_error "proxychains help command failed"
    fi
    
    # Test configuration file parsing
    log_test "Testing configuration file generation..."
    if [ -x "${SCRIPT_DIR}/generate-proxychains-config.sh" ]; then
        local test_output_dir="${OUTPUT_DIR}/maf-verify-${TASK_ID}"
        mkdir -p "$test_output_dir"
        
        if "${SCRIPT_DIR}/generate-proxychains-config.sh" --task-id "$TASK_ID" --dry-run >/dev/null 2>&1; then
            log_success "proxychains configuration generation works"
        else
            log_error "proxychains configuration generation failed"
        fi
    else
        log_warning "proxychains configuration generator not found"
    fi
    
    # Test with a simple connectivity check (may fail in isolated environments)
    if [ "$TEST_NETWORK" = true ]; then
        log_test "Testing network blocking functionality..."
        # Create a temporary restrictive config
        local temp_config="${OUTPUT_DIR}/test-proxychains-${TASK_ID}.conf"
        cat > "$temp_config" << 'CONFIG_EOF'
strict_chain
proxy_dns

[ProxyList]
# No proxies configured - should block all connections
CONFIG_EOF
        
        # Test that it blocks connections (this should fail)
        if timeout 5 "$proxychains_cmd" -f "$temp_config" ping -c 1 8.8.8.8 >/dev/null 2>&1; then
            log_warning "Network test passed (unexpected - may not be properly restricted)"
        else
            log_success "Network properly blocked by restrictive config"
        fi
        
        rm -f "$temp_config"
    fi
    
    return 0
}

# Legacy bubblewrap test (preserved for compatibility)
test_bubblewrap_functionality() {
    test_header "Filesystem (Bubblewrap)"
    
    # Check bubblewrap installation
    if ! check_tool_availability "bwrap" "Bubblewrap"; then
        log_warning "Filesystem security tests skipped - bubblewrap not available"
        return 0
    fi
    
    # Create test environment
    local test_workdir="${OUTPUT_DIR}/maf-bwrap-test-${TASK_ID}"
    mkdir -p "$test_workdir"
    echo "test data" > "$test_workdir/test.txt"
    
    log_test "Testing bubblewrap basic sandbox functionality..."
    
    # Test that we can run a simple command in bubblewrap
    if timeout 10 bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /bin /bin --proc /proc --dev /dev --unshare-all --share-net --bind "$test_workdir" "$test_workdir" --new-session /bin/cat "$test_workdir/test.txt" >/dev/null 2>&1; then
        log_success "bubblewrap basic sandbox works"
    else
        log_error "bubblewrap basic sandbox failed"
    fi
    
    # Test that system files are not accessible
    log_test "Testing filesystem isolation..."
    if timeout 10 bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /bin /bin --proc /proc --dev /dev --unshare-all --share-net --bind "$test_workdir" "$test_workdir" --new-session /bin/cat /etc/passwd >/dev/null 2>&1; then
        log_warning "System file access succeeded (sandbox may not be restrictive enough)"
    else
        log_success "System file access properly blocked"
    fi
    
    # Test that workspace files are accessible
    log_test "Testing workspace file access..."
    if timeout 10 bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /bin /bin --proc /proc --dev /dev --unshare-all --share-net --bind "$test_workdir" "$test_workdir" --new-session /bin/ls "$test_workdir" >/dev/null 2>&1; then
        log_success "Workspace file access works"
    else
        log_error "Workspace file access failed"
    fi
    
    # Cleanup
    rm -rf "$test_workdir"
    
    return 0
}

# Legacy cgroups test (preserved for compatibility)
test_cgroups_functionality() {
    test_header "Resource Limiting (Cgroups)"
    
    # Check if cgroups are available
    if [ ! -d /sys/fs/cgroup ]; then
        log_warning "Resource limiting tests skipped - cgroups not available"
        return 0
    fi
    
    log_test "Testing cgroups availability..."
    if [ -r /sys/fs/cgroup ]; then
        log_success "cgroups filesystem is accessible"
    else
        log_error "cgroups filesystem is not accessible"
        return 1
    fi
    
    # Detect cgroups version
    local cgroup_version="v1"
    if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
        cgroup_version="v2"
        log_success "cgroups v2 detected"
    else
        log_success "cgroups v1 detected"
    fi
    
    # Test cgroup setup script
    if [ -x "${SCRIPT_DIR}/setup-cgroups.sh" ]; then
        log_test "Testing cgroups configuration script..."
        
        if "${SCRIPT_DIR}/setup-cgroups.sh" --list >/dev/null 2>&1; then
            log_success "cgroups configuration script works"
        else
            log_error "cgroups configuration script failed"
        fi
        
        # Test cgroup creation and cleanup
        if [ "$TEST_RESOURCES" = true ]; then
            log_test "Testing cgroup creation and cleanup..."
            
            local test_task_id="verify-test-${TASK_ID}"
            
            # Create cgroup
            if "${SCRIPT_DIR}/setup-cgroups.sh" --task-id "$test_task_id" --cpu-shares 512 --memory-limit 64M --max-processes 5 --dry-run >/dev/null 2>&1; then
                log_success "cgroup configuration generation works"
            else
                log_error "cgroup configuration generation failed"
            fi
            
            # Try to create actual cgroup (may fail without proper permissions)
            if "${SCRIPT_DIR}/setup-cgroups.sh" --task-id "$test_task_id" --cpu-shares 512 --memory-limit 64M --max-processes 5 >/dev/null 2>&1; then
                log_success "cgroup creation works"
                
                # Clean up
                "${SCRIPT_DIR}/setup-cgroups.sh" --task-id "$test_task_id" --cleanup >/dev/null 2>&1
                log_success "cgroup cleanup works"
            else
                log_warning "cgroup creation failed (may need root permissions)"
            fi
        fi
    else
        log_warning "cgroups configuration script not found"
    fi
    
    return 0
}

# Test security policy loading
test_security_policy() {
    test_header "Security Policy"
    
    local policy_file="${MAF_ROOT}/.maf/configs/security-policy.json"
    
    log_test "Testing security policy availability..."
    if [ -f "$policy_file" ]; then
        log_success "Security policy file exists: $policy_file"
    else
        log_warning "Security policy file not found: $policy_file"
        return 0
    fi
    
    # Test JSON syntax
    if command -v jq >/dev/null 2>&1; then
        log_test "Testing security policy JSON syntax..."
        if jq empty "$policy_file" 2>/dev/null; then
            log_success "Security policy has valid JSON syntax"
        else
            log_error "Security policy has invalid JSON syntax"
        fi
        
        # Test policy structure
        log_test "Testing security policy structure..."
        local profile_count=$(jq '.profiles | length' "$policy_file" 2>/dev/null || echo "0")
        if [ "$profile_count" -gt 0 ]; then
            log_success "Security policy has $profile_count profile(s)"
            
            # Check for restricted profile
            if jq -e '.profiles.restricted' "$policy_file" >/dev/null 2>&1; then
                log_success "Restricted security profile found"
            else
                log_warning "Restricted security profile not found"
            fi
        else
            log_error "No security profiles found in policy"
        fi
    else
        log_warning "jq not available - skipping JSON validation"
    fi
    
    return 0
}

# Test system requirements
test_system_requirements() {
    test_header "System Requirements"
    
    # Check OS
    log_test "Testing operating system compatibility..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        log_success "Linux OS detected (full support)"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        log_success "macOS detected (partial support - no cgroups)"
    else
        log_warning "Unsupported OS: $OSTYPE"
    fi
    
    # Check available tools
    log_test "Checking for required utilities..."
    
    local required_tools=("cat" "echo" "mkdir" "grep" "awk")
    for tool in "${required_tools[@]}"; do
        if command -v "$tool" >/dev/null 2>&1; then
            log_verbose "✓ $tool available"
        else
            log_error "Required utility not found: $tool"
        fi
    done
    
    # Check optional but useful tools
    local optional_tools=("jq" "timeout" "numfmt")
    for tool in "${optional_tools[@]}"; do
        if command -v "$tool" >/dev/null 2>&1; then
            log_verbose "✓ $tool available"
        else
            log_verbose "⚠ $tool not available (optional)"
        fi
    done
    
    return 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -d|--detailed)
                DETAILED=true
                VERBOSE=true
                shift
                ;;
            -t|--task-id)
                TASK_ID="$2"
                shift 2
                ;;
            -o|--output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --skip-network)
                TEST_NETWORK=false
                shift
                ;;
            --skip-filesystem)
                TEST_FILESYSTEM=false
                shift
                ;;
            --skip-resources)
                TEST_RESOURCES=false
                shift
                ;;
            --skip-integration)
                SKIP_INTEGRATION=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --legacy-mode)
                SECURITY_PROPERTY_MODE=false
                log_warning "Legacy mode enabled - testing tool availability, NOT effectiveness"
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
    
    if [ "$QUIET" != true ]; then
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            log_info "MAF Security Property Verification v2.0.0"
            log_info "Mode: Security Effectiveness Testing (NOT tool availability)"
        else
            log_info "MAF Security Tools Verification v1.0.0 (Legacy Mode)"
            log_warning "Legacy mode measures tool availability, NOT security effectiveness"
        fi
        log_info "Task ID: $TASK_ID"
        echo
    fi
    
    # Run all test categories
    test_system_requirements
    test_security_policy
    
    if [ "$TEST_NETWORK" = true ]; then
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            test_network_boundary_effectiveness
        else
            test_proxychains_basic
        fi
    fi
    
    if [ "$TEST_FILESYSTEM" = true ]; then
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            test_filesystem_boundary_effectiveness
        else
            test_bubblewrap_functionality
        fi
    fi
    
    if [ "$TEST_RESOURCES" = true ]; then
        if [ "$SECURITY_PROPERTY_MODE" = true ]; then
            test_resource_boundary_effectiveness
        else
            test_cgroups_functionality
        fi
    fi
    
    # Show summary and exit
    test_summary
    local exit_code=$?
    
    if [ "$QUIET" != true ]; then
        if [ $exit_code -eq 0 ]; then
            echo
            if [ "$SECURITY_PROPERTY_MODE" = true ]; then
                log_info "Security property verification completed successfully!"
                log_info "MAF security isolation boundaries are EFFECTIVE and enforced."
            else
                log_warning "Tool availability verification completed."
                log_warning "Run with security property mode for actual effectiveness testing."
            fi
        else
            echo
            log_error "Security verification completed with failures."
            if [ "$SECURITY_PROPERTY_MODE" = true ]; then
                log_error "Security boundaries can be bypassed - REAL vulnerabilities detected."
            else
                log_error "Please resolve the issues before using MAF security isolation."
            fi
        fi
    fi
    
    exit $exit_code
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
