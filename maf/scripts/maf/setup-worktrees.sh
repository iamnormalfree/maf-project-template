#!/bin/bash
# ABOUTME: Setup Git worktrees for MAF implementor isolation
# ABOUTME: Creates separate working directories for parallel development without branch-switching collisions

set -euo pipefail

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
TOPOLOGY_FILE="${MAF_ROOT}/.maf/config/agent-topology.json"
WORKTREES_BASE="${MAF_ROOT}-worktrees"
MAIN_BRANCH="master"
AGENT_FILTER=""
DRY_RUN=false
CLEANUP=false
LIST=false
VERBOSE=false
FORCE=false

# Help message
show_help() {
    cat << EOHELP
MAF Worktree Setup Script - Create Git worktrees for implementor isolation

USAGE:
    setup-worktrees.sh [OPTIONS]

OPTIONS:
    -a, --agent <imp1|imp2|all>  Specific implementor to setup (default: all)
    -b, --branch <branch>        Base branch to create worktrees from (default: master)
    -t, --topology <file>        Agent topology file (default: .maf/config/agent-topology.json)
    -w, --worktrees-dir <path>   Worktrees base directory (default: /root/projects/roundtable-worktrees)
    --dry-run                    Show what would be done without making changes
    --cleanup                    Remove worktrees for specified agent(s)
    --list                       List all worktrees and their status
    -f, --force                  Force recreate worktree if exists
    -v, --verbose                Enable verbose output
    -h, --help                   Show this help message

IMPLEMENTORS:
    imp1, 2     OrangePond   (frontend, site, portal)
    imp2, 3     FuchsiaCreek (backend, api, library, email)

EXAMPLES:
    # Create worktrees for all implementors
    ./setup-worktrees.sh

    # Create worktree for single implementor
    ./setup-worktrees.sh --agent imp1

    # List existing worktrees
    ./setup-worktrees.sh --list

    # Cleanup worktree for single implementor
    ./setup-worktrees.sh --cleanup --agent imp1

    # Cleanup all worktrees
    ./setup-worktrees.sh --cleanup --agent all

EXIT CODES:
    0   Worktrees configured successfully
    1   Error in worktree configuration
    2   Required arguments missing
    3   Git worktree command failed

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

# Check if required commands are available
check_dependencies() {
    local missing_deps=()

    if ! command -v git &> /dev/null; then
        missing_deps+=("git")
    fi

    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi

    if ! command -v pnpm &> /dev/null; then
        missing_deps+=("pnpm")
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install missing dependencies and try again"
        return 1
    fi

    return 0
}

# Check if we're in a Git repository
check_git_repo() {
    if ! git -C "$MAF_ROOT" rev-parse --git-dir &> /dev/null; then
        log_error "Not a Git repository: $MAF_ROOT"
        return 1
    fi

    log_verbose "Git repository verified: $MAF_ROOT"
    return 0
}

# Check if remote branch exists
check_remote_branch() {
    local branch="$1"

    if ! git -C "$MAF_ROOT" rev-parse --verify "origin/$branch" &> /dev/null; then
        log_error "Remote branch does not exist: origin/$branch"
        log_info "Available remote branches:"
        git -C "$MAF_ROOT" branch -r | sed 's/^/  /'
        return 1
    fi

    log_verbose "Remote branch verified: origin/$branch"
    return 0
}

# List all MAF worktrees
list_worktrees() {
    log_info "MAF Worktrees:"

    # List Git worktrees
    log_info "Git worktrees:"
    git -C "$MAF_ROOT" worktree list | sed 's/^/  /' || true

    echo

    # Check worktrees base directory
    if [ -d "$WORKTREES_BASE" ]; then
        log_info "Worktrees base directory: $WORKTREES_BASE"

        for worktree_dir in "$WORKTREES_BASE"/*; do
            if [ -d "$worktree_dir" ]; then
                local agent_name=$(basename "$worktree_dir")
                echo
                log_info "  Worktree: $agent_name"
                log_info "    Path: $worktree_dir"

                # Show current branch
                if [ -d "$worktree_dir/.git" ]; then
                    local current_branch=$(git -C "$worktree_dir" branch --show-current 2>/dev/null || echo "unknown")
                    log_info "    Branch: $current_branch"

                    # Show uncommitted changes
                    local status=$(git -C "$worktree_dir" status --porcelain 2>/dev/null | wc -l)
                    if [ "$status" -gt 0 ]; then
                        log_warning "    Uncommitted changes: $status files"
                    else
                        log_info "    Clean: no uncommitted changes"
                    fi
                else
                    log_warning "    Not a valid Git worktree (missing .git)"
                fi
            fi
        done
    else
        log_info "Worktrees base directory does not exist: $WORKTREES_BASE"
    fi

    echo
}

# Read implementor information from topology file
read_implementors() {
    if [ ! -f "$TOPOLOGY_FILE" ]; then
        log_error "Topology file not found: $TOPOLOGY_FILE"
        return 1
    fi

    log_verbose "Reading topology from: $TOPOLOGY_FILE"

    # Extract implementors from topology JSON as a JSON array
    local implementors_json=$(jq '[.panes[] | select(.role | startswith("implementor")) | {
        index: .index,
        role: .role,
        agent_name: .agent_name,
        domains: .domains
    }]' "$TOPOLOGY_FILE")

    if [ -z "$implementors_json" ] || [ "$implementors_json" = "[]" ] || [ "$implementors_json" = "null" ]; then
        log_error "No implementors found in topology file"
        return 1
    fi

    # Output the JSON array
    echo "$implementors_json"
}

# Create worktree for a single implementor
create_worktree() {
    local pane_index="$1"
    local agent_name="$2"
    local domains="$3"

    local worktree_path="${WORKTREES_BASE}/${agent_name}"
    local branch_name="work/$(echo "$agent_name" | tr '[:upper:]' '[:lower:]')"

    log_info "Creating worktree for $agent_name (pane $pane_index)"
    log_verbose "  Worktree path: $worktree_path"
    log_verbose "  Branch: $branch_name"
    log_verbose "  Domains: $domains"

    # Check if worktree already exists
    if [ -d "$worktree_path" ]; then
        if [ "$FORCE" = true ]; then
            log_warning "Worktree already exists, recreating (--force)"
            remove_worktree "$pane_index" "$agent_name"
        else
            log_warning "Worktree already exists: $worktree_path"
            log_info "Use --force to recreate, or --cleanup to remove"
            return 0
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would create worktree at: $worktree_path"
        echo "  git worktree add $worktree_path -b $branch_name origin/$MAIN_BRANCH"
        echo "  cd $worktree_path && pnpm install"
        return 0
    fi

    # Create worktrees base directory
    mkdir -p "$WORKTREES_BASE"

    # Create Git worktree
    log_info "Creating Git worktree..."
    if ! git -C "$MAF_ROOT" worktree add "$worktree_path" -b "$branch_name" "origin/$MAIN_BRANCH"; then
        log_error "Failed to create Git worktree"
        return 1
    fi

    log_success "Git worktree created: $worktree_path"

    # Install dependencies in worktree
    log_info "Installing dependencies (this may take 2-5 minutes)..."
    if ! pnpm --dir "$worktree_path" install --frozen-lockfile; then
        log_error "Failed to install dependencies"
        log_warning "Cleaning up failed worktree..."
        remove_worktree "$pane_index" "$agent_name"
        return 1
    fi

    log_success "Dependencies installed successfully"

    # Create README in worktree
    create_worktree_readme "$agent_name" "$pane_index" "$branch_name" "$domains" "$worktree_path"

    # Update topology JSON with worktree path
    update_topology_json "$pane_index" "$agent_name" "$worktree_path" "$branch_name"

    log_success "Worktree setup complete for $agent_name"
    echo

    return 0
}

# Create README.md in worktree
create_worktree_readme() {
    local agent_name="$1"
    local pane_index="$2"
    local branch_name="$3"
    local domains="$4"
    local worktree_path="$5"

    local readme_path="${worktree_path}/README.md"

    cat > "$readme_path" << EOF
# ${agent_name} Worktree

This is a Git worktree for **${agent_name}** (Implementor pane ${pane_index}).

## Worktree Information

- **Agent**: ${agent_name} (pane ${pane_index})
- **Branch**: \`${branch_name}\`
- **Main Checkout**: \`${MAF_ROOT}\`
- **Domains**: ${domains}
- **Created**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Development Commands

\`\`\`bash
# Run tests
pnpm test

# Run specific package tests
pnpm --filter backend test     # For FuchsiaCreek
pnpm --filter @roundtable/site test  # For OrangePond

# Run development server
pnpm backend:dev     # For FuchsiaCreek
pnpm site:dev        # For OrangePond

# Build
pnpm build
\`\`\`

## Git Workflow

This worktree uses the branch \`${branch_name}\` for isolated development.

\`\`\`bash
# Check current branch
git branch

# Make changes and commit
git status
git add .
git commit -m "feat: description"

# Push to remote
git push -u origin ${branch_name}

# Pull latest changes
git pull origin ${branch_name}
\`\`\`

## File Reservations

When using Agent Mail file reservations, **use this worktree path as the project_key**:

\`\`\`javascript
mcp__mcp_agent_mail__file_reservation_paths({
  project_key: "${worktree_path}",  // Worktree path (absolute)
  agent_name: "${agent_name}",
  paths: $([ "$agent_name" = "OrangePond" ] && echo '["apps/site/**", "docs/**"]' || echo '["apps/backend/src/**", "apps/backend/src/email/**"]'),
  ttl_seconds: 7200,
  exclusive: true,
  reason: "bead-id: description"
})
\`\`\`

**IMPORTANT**:
- GLOBAL LOCKS (pnpm-lock.yaml, migrations) are reserved in the **main checkout** by Supervisor
- MODULE LOCKS (apps/site/**, apps/backend/src/**) are reserved in **worktrees**
- Never reserve GLOBAL LOCKS in worktrees - ask Supervisor to coordinate

## Cleanup

After bead completion and PR merge:

\`\`\`bash
# Option 1: Remove worktree entirely
cd "$MAF_ROOT"
./scripts/maf/setup-worktrees.sh --cleanup --agent $(basename "$worktree_path")

# Option 2: Keep worktree, reset branch
git checkout ${branch_name}
git reset --hard origin/${MAIN_BRANCH}
\`\`\`

## Integration with Context Manager

The context manager (context-manager-v2.sh) automatically changes to this worktree
when restarting implementor agents.

To verify working directory:
\`\`\`bash
# In tmux, check pane working directory
tmux send-keys -t maf-cli:agents.${pane_index} "pwd" Enter
# Should show: ${worktree_path}
\`\`\`

## Troubleshooting

**Worktree not found after context manager restart:**
\`\`\`bash
# Verify worktree exists
git -C "$MAF_ROOT" worktree list

# Re-create worktree if needed
./scripts/maf/setup-worktrees.sh --agent $(basename "$worktree_path")
\`\`\`

**Merge conflicts after pulling:**
\`\`\`bash
# Resolve conflicts manually
git status
# Edit conflicting files...
git add .
git commit -m "fix: resolve merge conflicts"
\`\`\`
EOF

    log_verbose "Created README: $readme_path"
}

# Update topology JSON with worktree path
update_topology_json() {
    local pane_index="$1"
    local agent_name="$2"
    local worktree_path="$3"
    local branch_name="$4"

    # Create worktrees section if it doesn't exist
    if ! jq -e '.worktrees' "$TOPOLOGY_FILE" &> /dev/null; then
        jq '. + {worktrees: {}}' "$TOPOLOGY_FILE" > "${TOPOLOGY_FILE}.tmp" && mv "${TOPOLOGY_FILE}.tmp" "$TOPOLOGY_FILE"
    fi

    # Add worktree entry for this pane
    jq --arg pane "$pane_index" \
       --arg agent_name "$agent_name" \
       --arg path "$worktree_path" \
       --arg branch "$branch_name" \
       --arg created_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
       '.worktrees[$pane] = {
           agent_name: $agent_name,
           path: $path,
           branch: $branch,
           created_at: $created_at,
           last_updated: $created_at
       }' "$TOPOLOGY_FILE" > "${TOPOLOGY_FILE}.tmp" && mv "${TOPOLOGY_FILE}.tmp" "$TOPOLOGY_FILE"

    log_verbose "Updated topology JSON with worktree metadata"
}

# Remove worktree for a single implementor
remove_worktree() {
    local pane_index="$1"
    local agent_name="$2"

    local worktree_path="${WORKTREES_BASE}/${agent_name}"

    log_info "Removing worktree for $agent_name"

    if [ ! -d "$worktree_path" ]; then
        log_warning "Worktree directory not found: $worktree_path"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would remove worktree: $worktree_path"
        echo "  git worktree remove $worktree_path"
        return 0
    fi

    # Remove Git worktree
    if ! git -C "$MAF_ROOT" worktree remove "$worktree_path" 2>/dev/null; then
        log_warning "Git worktree remove failed, removing directory manually..."
        rm -rf "$worktree_path"
    else
        log_success "Git worktree removed"
    fi

    # Remove from topology JSON
    if jq -e ".worktrees[\"$pane_index\"]" "$TOPOLOGY_FILE" &> /dev/null; then
        jq "del(.worktrees[\"$pane_index\"])" "$TOPOLOGY_FILE" > "${TOPOLOGY_FILE}.tmp" && mv "${TOPOLOGY_FILE}.tmp" "$TOPOLOGY_FILE"
        log_verbose "Removed worktree from topology JSON"
    fi

    # Remove worktrees base directory if empty
    if [ -d "$WORKTREES_BASE" ]; then
        local remaining=$(ls -A "$WORKTREES_BASE" 2>/dev/null || true)
        if [ -z "$remaining" ]; then
            rmdir "$WORKTREES_BASE"
            log_verbose "Removed empty worktrees base directory"
        fi
    fi

    log_success "Worktree removed for $agent_name"
    echo

    return 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--agent)
                AGENT_FILTER="$2"
                shift 2
                ;;
            -b|--branch)
                MAIN_BRANCH="$2"
                shift 2
                ;;
            -t|--topology)
                TOPOLOGY_FILE="$2"
                shift 2
                ;;
            -w|--worktrees-dir)
                WORKTREES_BASE="$2"
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
            -f|--force)
                FORCE=true
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
                exit 2
                ;;
        esac
    done
}

# Main function
main() {
    parse_args "$@"

    # Check dependencies
    if ! check_dependencies; then
        exit 1
    fi

    # Check Git repository
    if ! check_git_repo; then
        exit 1
    fi

    # Handle list command
    if [ "$LIST" = true ]; then
        list_worktrees
        exit 0
    fi

    # Check remote branch
    if ! check_remote_branch "$MAIN_BRANCH"; then
        exit 1
    fi

    # Read implementors from topology
    local implementors_json
    implementors_json=$(read_implementors)
    if [ $? -ne 0 ]; then
        exit 1
    fi

    log_info "MAF Worktree Setup Script v1.0.0"
    log_info "Worktrees base: $WORKTREES_BASE"
    log_info "Main branch: $MAIN_BRANCH"

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN MODE - No changes will be made"
    fi

    if [ "$CLEANUP" = true ]; then
        log_info "Cleanup mode"
    fi

    echo

    # Process each implementor
    local total_implementors=$(echo "$implementors_json" | jq 'length')
    local processed_count=0

    for ((i=0; i<total_implementors; i++)); do
        local implementor=$(echo "$implementors_json" | jq ".[$i]")
        local pane_index=$(echo "$implementor" | jq -r '.index')
        local agent_name=$(echo "$implementor" | jq -r '.agent_name')
        local domains=$(echo "$implementor" | jq -r '.domains | join(", ")')

        # Filter by agent if specified
        if [ -n "$AGENT_FILTER" ] && [ "$AGENT_FILTER" != "all" ]; then
            local filter_matched=false

            # Check by pane index
            if [ "$AGENT_FILTER" = "$pane_index" ]; then
                filter_matched=true
            fi

            # Check by agent name (case-insensitive)
            if echo "$agent_name" | grep -qi "$AGENT_FILTER"; then
                filter_matched=true
            fi

            # Check by role prefix (imp1, imp2, etc.)
            if echo "$AGENT_FILTER" | grep -q "^imp"; then
                local imp_num=$(echo "$AGENT_FILTER" | sed 's/imp//')
                if [ "$imp_num" = "$((pane_index - 1))" ]; then
                    filter_matched=true
                fi
            fi

            if [ "$filter_matched" = false ]; then
                log_verbose "Skipping $agent_name (doesn't match filter: $AGENT_FILTER)"
                continue
            fi
        fi

        processed_count=$((processed_count + 1))

        if [ "$CLEANUP" = true ]; then
            remove_worktree "$pane_index" "$agent_name"
        else
            create_worktree "$pane_index" "$agent_name" "$domains"
        fi
    done

    if [ "$processed_count" -eq 0 ]; then
        log_warning "No implementors processed"
        if [ -n "$AGENT_FILTER" ]; then
            log_info "Filter '$AGENT_FILTER' matched no implementors"
            log_info "Available implementors:"
            for ((i=0; i<total_implementors; i++)); do
                local implementor=$(echo "$implementors_json" | jq ".[$i]")
                local pane_index=$(echo "$implementor" | jq -r '.index')
                local agent_name=$(echo "$implementor" | jq -r '.agent_name')
                echo "  - Pane $pane_index: $agent_name"
            done
        fi
        exit 2
    fi

    # Summary
    echo
    if [ "$CLEANUP" = true ]; then
        log_success "Cleanup complete! Processed $processed_count implementor(s)"
    else
        log_success "Worktree setup complete! Processed $processed_count implementor(s)"
        echo
        log_info "Next steps:"
        log_info "  1. Verify worktrees: git worktree list"
        log_info "  2. Test worktree: cd $WORKTREES_BASE/\${agent_name} && pnpm test"
        log_info "  3. Restart context manager: ./scripts/maf/context-manager-v2.sh restart"
    fi

    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
