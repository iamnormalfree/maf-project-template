#!/bin/bash
# Unix/Linux/macOS shell wrapper for orchestrator-firewall.py
# Executes the Python hook script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Execute Python hook
python3 "$SCRIPT_DIR/orchestrator-firewall.py"
exit $?
