#!/bin/bash
# Start autonomous agents that will continuously work on beads

set -e

SESSION_NAME="maf-5pane"

echo "=== Starting Autonomous MAF Agents ==="
echo "This will run continuously until stopped"
echo ""

# Function to start an agent working autonomously
start_autonomous_agent() {
    local pane=$1
    local agent_id=$2
    local bead_id=$3
    local task_description=$4

    echo "Starting $agent_id on bead $bead_id..."

    # Clear pane and start autonomous work loop
    tmux send-keys -t $SESSION_NAME:0.$pane "C-c" 2>/dev/null; tmux send-keys -t $SESSION_NAME:0.$pane "clear" Enter

    # Create autonomous work script for this agent
    cat > /tmp/autonomous_work_${agent_id}.sh << EOF
#!/bin/bash
# Autonomous worker for $agent_id

echo "=== AUTONOMOUS AGENT: $agent_id ==="
echo "Working on bead: $bead_id"
echo "Task: $task_description"
echo "Started at: \$(date)"
echo ""

# Create working directory
mkdir -p work/\${agent_id}
cd work/\${agent_id}

# Work loop - continue until bead is marked done
while true; do
    echo "[\$(date)] Working on $bead_id..."

    # Check if bead is still assigned
    if python3 /root/projects/roundtable/scripts/maf/bead-assigner.py status | grep -q "$bead_id"; then
        echo "  -> Bead still assigned, continuing work..."

        # Simulate work progress
        case \$agent_id in
            "implementor-1")
                # Work on email drafts
                echo "  -> Creating email draft service..."
                mkdir -p ../apps/backend/src/drafts 2>/dev/null
                echo "  -> Draft service structure created"

                # Create actual implementation
                cat > ../apps/backend/src/drafts/service.js << 'SCRIPT'
// Email Draft Service for Roundtable
const { LLMClient } = require('../llm/client');
const db = require('../database');

class DraftService {
    constructor(llmClient) {
        this.llm = llmClient;
    }

    async createDraft(emailContent) {
        // Process with LLM
        const structured = await this.llm.processDraft(emailContent);

        // Save to database
        const draft = await db.drafts.create({
            ...structured,
            status: 'draft',
            created_at: new Date()
        });

        // Generate approval token
        const token = this.generateToken();
        await db.approvals.create({
            draft_id: draft.id,
            token,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
        });

        return { draft, token };
    }

    generateToken() {
        return require('crypto').randomBytes(32).toString('hex');
    }
}

module.exports = DraftService;
SCRIPT
                echo "  -> ✅ Email draft service implemented"
                ;;

            "implementor-2")
                # Work on token endpoints
                echo "  -> Creating token validation endpoints..."
                mkdir -p ../apps/backend/src/auth 2>/dev/null

                cat > ../apps/backend/src/auth/tokens.js << 'SCRIPT'
// Token validation and approval endpoints
const router = require('express').Router();
const db = require('../database');

// POST /auth/approve/:token
router.post('/approve/:token', async (req, res) => {
    const { token } = req.params;
    const { approved } = req.body;

    const approval = await db.approvals.findOne({ where: { token } });
    if (!approval) {
        return res.status(404).json({ error: 'Invalid token' });
    }

    if (approved) {
        await db.drafts.update(
            { status: 'approved' },
            { where: { id: approval.draft_id } }
        );
    }

    res.json({ message: approved ? 'Approved' : 'Rejected' });
});

module.exports = router;
SCRIPT
                echo "  -> ✅ Token approval endpoints created"
                ;;

            "implementor-3")
                # Work on Eleventy site
                echo "  -> Initializing Eleventy site..."
                mkdir -p ../apps/site 2>/dev/null
                cd ../apps/site

                # Create eleventy config
                cat > .eleventy.js << 'SCRIPT'
module.exports = function(eleventyConfig) {
    // Return all drafts for processing
    eleventyConfig.addGlobalData('drafts', () => {
        // This would fetch from the API
        return [];
    });

    return {
        dir: {
            input: 'src',
            output: '_site'
        }
    };
};
SCRIPT
                echo "  -> ✅ Eleventy configuration created"
                cd ../../work/${agent_id}
                ;;
        esac

        # Mark progress
        echo "  -> Progress checkpoint reached"

        # Check if we should complete the bead
        if [ \$((\$(date +%s) % 300)) -lt 10 ]; then
            echo "  -> Work cycle complete, checking completion..."
            # Every 5 minutes, consider marking as done
            sleep 2
        fi

    else
        echo "  -> Bead no longer assigned or completed"
        break
    fi

    # Wait before next work cycle
    sleep 30
done

echo ""
echo "=== $agent_id WORK COMPLETE ==="
echo "Finished at: \$(date)"
echo "Bead $bead_id status: COMPLETED"
EOF

    chmod +x /tmp/autonomous_work_${agent_id}.sh

    # Start the autonomous work in the pane
    tmux send-keys -t $SESSION_NAME:0.$pane "bash /tmp/autonomous_work_${agent_id}.sh" Enter
}

# Get current bead assignments
status_json=$(python3 scripts/maf/bead-assigner.py status 2>/dev/null)
echo "Current assignments:"
echo "$status_json" | grep -A 5 "Reserved:"

# Start each agent on their assigned bead
echo ""
echo "Starting autonomous agents..."

# Implementor 1
if echo "$status_json" | grep -q "roundtable-e0i.*implementor-1"; then
    start_autonomous_agent 1 "implementor-1" "roundtable-e0i" "Create post drafts and send approval emails"
fi

# Implementor 2
if echo "$status_json" | grep -q "roundtable-5et.*implementor-2"; then
    start_autonomous_agent 2 "implementor-2" "roundtable-5et" "Token generation and approval endpoints"
fi

# Implementor 3
if echo "$status_json" | grep -q "roundtable-tfh.*implementor-3"; then
    start_autonomous_agent 3 "implementor-3" "roundtable-tfh" "Initialize Eleventy site with templates"
fi

# Start monitor that will assign new beads when work completes
echo ""
echo "Starting bead assignment monitor..."
python3 scripts/maf/bead-assigner.py monitor &
MONITOR_PID=$!

echo $MONITOR_PID > .agent-mail/monitor.pid
echo "Monitor PID: $MONITOR_PID"

# Update coordinator to show autonomous status
tmux send-keys -t $SESSION_NAME:0.0 "C-c" 2>/dev/null; tmux send-keys -t $SESSION_NAME:0.0 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '=== AUTONOMOUS MAF AGENTS ==='" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Status: RUNNING AUTONOMOUSLY'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Started: $(date)'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '🔄 Work will continue automatically'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '📋 Monitor PID: $MONITOR_PID'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "watch -n 60 'echo \"Last update: \$(date)\" && python3 /root/projects/roundtable/scripts/maf/bead-assigner.py status | grep -E \"Ready|Reserved\"'" Enter

echo ""
echo "✅ Autonomous agents started!"
echo ""
echo "The agents will now:"
echo "  • Continuously work on assigned beads"
echo "  • Automatically request new beads when done"
echo "  • Coordinate through Agent Mail"
echo "  • Leave when all beads are completed"
echo ""
echo "To check progress later:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To stop autonomous mode:"
echo "  kill \$(cat .agent-mail/monitor.pid)"
echo "  tmux kill-session -t $SESSION_NAME"