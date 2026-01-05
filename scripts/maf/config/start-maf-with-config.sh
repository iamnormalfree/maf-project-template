#!/bin/bash
# ABOUTME: Demonstrates starting MAF sessions with the new agent configuration

set -euo pipefail

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Configuration file path
AGENT_CONFIG_FILE="${AGENT_CONFIG_FILE:-$PROJECT_ROOT/.maf/config/default-agent-config.json}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to load session layout
load_session_layout() {
    local layout_name="${1:-default_4_pane}"
    
    if [[ ! -f "$AGENT_CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Configuration file not found${NC}"
        return 1
    fi
    
    local layout_config
    layout_config=$(jq -r ".session_layouts[\"$layout_name\"]" "$AGENT_CONFIG_FILE" 2>/dev/null)
    
    if [[ "$layout_config" == "null" ]]; then
        echo -e "${RED}Error: Layout '$layout_name' not found${NC}"
        return 1
    fi
    
    echo "$layout_config"
}

# Function to create tmux session based on layout
create_maf_session() {
    local session_name="${1:-maf-session}"
    local layout_name="${2:-default_4_pane}"
    
    echo -e "${BLUE}Creating MAF session: $session_name${NC}"
    echo -e "${YELLOW}Layout: $layout_name${NC}"
    echo ""
    
    # Load layout configuration
    local layout_config
    layout_config=$(load_session_layout "$layout_name")
    
    if [[ -z "$layout_config" ]]; then
        echo -e "${RED}Failed to load layout configuration${NC}"
        return 1
    fi
    
    # Check if session already exists
    if tmux has-session -t "$session_name" 2>/dev/null; then
        echo -e "${YELLOW}Session '$session_name' already exists. Attaching...${NC}"
        tmux attach-session -t "$session_name"
        return 0
    fi
    
    # Create new session
    echo "Creating tmux session: $session_name"
    tmux new-session -d -s "$session_name"
    
    # Get pane configurations
    local pane_count
    pane_count=$(echo "$layout_config" | jq -r '.panes | length')
    
    echo "Configuring $pane_count panes..."
    
    # Configure panes based on layout
    case "$layout_name" in
        "default_4_pane")
            # Split into 4 panes
            tmux split-window -h -t "$session_name"
            tmux split-window -v -t "$session_name:0"
            tmux split-window -v -t "$session_name:2"
            
            # Setup coordinator (top-left)
            tmux send-keys -t "$session_name:0" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:0" "echo 'MAF Coordinator - Monitoring session'" Enter
            tmux send-keys -t "$session_name:0" "npm run maf:status" Enter
            
            # Setup worker-1 (top-right)
            tmux send-keys -t "$session_name:1" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:1" "echo 'MAF Worker 1 - Ready for tasks'" Enter
            tmux send-keys -t "$session_name:1" "npm run maf:claim-task" Enter
            
            # Setup worker-2 (bottom-left)
            tmux send-keys -t "$session_name:2" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:2" "echo 'MAF Worker 2 - Ready for tasks'" Enter
            tmux send-keys -t "$session_name:2" "npm run maf:claim-task" Enter
            
            # Setup reviewer (bottom-right)
            tmux send-keys -t "$session_name:3" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:3" "echo 'MAF Reviewer - Code review ready'" Enter
            tmux send-keys -t "$session_name:3" "npm run lint" Enter
            ;;
            
        "minimal_2_pane")
            # Split into 2 panes
            tmux split-window -h -t "$session_name"
            
            # Setup worker (left)
            tmux send-keys -t "$session_name:0" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:0" "echo 'MAF Worker - Ready for tasks'" Enter
            tmux send-keys -t "$session_name:0" "npm run maf:claim-task" Enter
            
            # Setup committer (right)
            tmux send-keys -t "$session_name:1" "cd $PROJECT_ROOT" Enter
            tmux send-keys -t "$session_name:1" "echo 'MAF Committer - Git operations ready'" Enter
            tmux send-keys -t "$session_name:1" "git status" Enter
            ;;
    esac
    
    # Enable mouse support
    tmux set-option -g mouse on -t "$session_name"
    
    # Set window titles
    if command -v jq &> /dev/null; then
        local pane_index=0
        echo "$layout_config" | jq -r '.panes[].name' | while read -r pane_name; do
            if [[ -n "$pane_name" ]]; then
                tmux rename-window -t "$session_name:$pane_index" "$pane_name" 2>/dev/null || true
            fi
            ((pane_index++))
        done
    fi
    
    echo -e "${GREEN}✅ MAF session '$session_name' created successfully${NC}"
    echo ""
    echo "To attach to the session:"
    echo "  tmux attach-session -t $session_name"
    echo ""
    echo "To list all sessions:"
    echo "  tmux list-sessions"
    echo ""
    echo "To kill the session:"
    echo "  tmux kill-session -t $session_name"
}

# Function to show available layouts
show_available_layouts() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required to show layouts${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Available layouts:${NC}"
    jq -r '.session_layouts | to_entries[] | "  \(.key): \(.value.description)"' "$AGENT_CONFIG_FILE" 2>/dev/null
}

# Main function
main() {
    local action="${1:-start}"
    local session_name="${2:-maf-session}"
    local layout_name="${3:-default_4_pane}"
    
    echo -e "${BLUE}MAF Configuration-Driven Session Manager${NC}"
    echo "=========================================="
    echo ""
    
    case "$action" in
        "start")
            create_maf_session "$session_name" "$layout_name"
            ;;
        "layouts")
            show_available_layouts
            ;;
        "help"|"--help"|"-h")
            echo "Usage: $0 [start|layouts|help] [session_name] [layout_name]"
            echo ""
            echo "Commands:"
            echo "  start     - Start a new MAF session (default)"
            echo "  layouts   - Show available layouts"
            echo "  help      - Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Start session with default layout"
            echo "  $0 start my-session minimal_2_pane    # Start with specific layout"
            echo "  $0 layouts                            # Show available layouts"
            ;;
        *)
            echo -e "${RED}Unknown action: $action${NC}"
            echo ""
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
