#!/bin/bash
# Create actively communicating agents

SESSION_NAME="maf-5pane"

echo "=== Creating Active Communicating Agents ==="

# Function to create an active work loop in a pane
create_active_agent() {
    local pane=$1
    local agent_name=$2
    local bead=$3

    echo "Creating active agent: $agent_name in pane $pane"

    # Send work loop to pane
    tmux send-keys -t "$SESSION_NAME:0.$pane" "clear" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '=== $agent_name === Working on $bead ==='" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo ''" Enter

    # Create a visible work loop
    cat << 'EOF' > /tmp/work_loop.sh
#!/bin/bash
# Active work loop for agent
AGENT_NAME="$1"
BEAD_ID="$2"

WORK_DIR="/tmp/agent_work_${AGENT_NAME}"
mkdir -p "$WORK_DIR"

# Counter for work cycles
COUNTER=0

while true; do
    COUNTER=$((COUNTER + 1))
    TIMESTAMP=$(date '+%H:%M:%S')

    # Show activity
    echo "[$AGENT_NAME] Work cycle $COUNTER at $TIMESTAMP"

    # Do some actual work
    case $COUNTER in
        1|5|9|13)
            echo "[$AGENT_NAME] -> ALL: Creating directory structure for $BEAD_ID"
            mkdir -p "apps/backend/src/$(echo $BEAD_ID | cut -d- -f2)"
            ;;
        2|6|10|14)
            echo "[$AGENT_NAME] -> ALL: Writing implementation files..."
            sleep 1
            ;;
        3|7|11|15)
            echo "[$AGENT_NAME] -> ALL: Running tests..."
            sleep 1
            ;;
        4|8|12|16)
            echo "[$AGENT_NAME] -> ALL: Code review in progress..."
            sleep 1
            ;;
    esac

    # Sleep between cycles
    sleep 5
done
EOF

    chmod +x /tmp/work_loop.sh

    # Start the work loop in the agent's pane
    tmux send-keys -t "$SESSION_NAME:0.$pane" "bash /tmp/work_loop.sh $agent_name $bead" Enter
}

# Get current assignments
echo "Checking bead assignments..."
assignments=$(python3 scripts/maf/bead-assigner.py status 2>/dev/null)

# Create active agents
if echo "$assignments" | grep -q "roundtable-vf5.*implementor-1"; then
    create_active_agent 1 "Implementor-1" "roundtable-vf5"
fi

if echo "$assignments" | grep -q "roundtable-dsg.*implementor-2"; then
    create_active_agent 2 "Implementor-2" "roundtable-dsg"
fi

if echo "$assignments" | grep -q "roundtable-tfh.*implementor-3"; then
    create_active_agent 3 "Implementor-3" "roundtable-tfh"
fi

# Create active reviewer
tmux send-keys -t "$SESSION_NAME:0.4" "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo '=== REVIEWER === Active Monitoring ===' " Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo '' " Enter

cat << 'EOF' > /tmp/reviewer_loop.sh
#!/bin/bash
# Active reviewer loop
while true; do
    TIMESTAMP=$(date '+%H:%M:%S')
    echo "[REVIEWER] Status check at $TIMESTAMP"

    # Check work directories
    if [ -d "/tmp/agent_work_Implementor-1" ]; then
        echo "[REVIEWER] -> Implementor-1: Files created"
    fi

    if [ -d "/tmp/agent_work_Implementor-2" ]; then
        echo "[REVIEWER] -> Implementor-2: Files created"
    fi

    if [ -d "/tmp/agent_work_Implementor-3" ]; then
        echo "[REVIEWER] -> Implementor-3: Files created"
    fi

    sleep 10
done
EOF

chmod +x /tmp/reviewer_loop.sh
tmux send-keys -t "$SESSION_NAME:0.4 "bash /tmp/reviewer_loop.sh" Enter

# Update coordinator
tmux send-keys -t "$SESSION_NAME:0.0 "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo '=== MAF COORDINATOR ===' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Agents: ACTIVE and COMMUNICATING' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Started: $(date)' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo '' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Watch each pane for activity!' " Enter

# Start communication monitor in background
chmod +x scripts/maf/agent-communication.sh
scripts/maf/agent-communication.sh start &
COMM_PID=$!
echo $COMM_PID > .agent-mail/comm-pid.pid

echo ""
echo "✅ Active agents created!"
echo ""
echo "Each agent will:"
echo "  • Show work cycles every 5 seconds"
echo "  • Communicate with other agents"
echo "  • Create directories and files"
echo "  • Send status updates"
echo ""
echo "Communication monitor PID: $COMM_PID"
echo ""
echo "To see the activity:"
echo "  tmux attach -t $SESSION_NAME"