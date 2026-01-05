#!/bin/bash

# Patch script for Memlayer import fixes
# This script applies the necessary fixes to make Memlayer work with our agent system

set -e

VENV_PATH="/root/projects/roundtable/venv_memlayer"
CLIENT_FILE="$VENV_PATH/lib/python3.12/site-packages/memlayer/client.py"

echo "Applying Memlayer patches..."

# Check if venv exists
if [[ ! -d "$VENV_PATH" ]]; then
    echo "Error: Memlayer venv not found at $VENV_PATH"
    exit 1
fi

# Check if client file exists
if [[ ! -f "$CLIENT_FILE" ]]; then
    echo "Error: Memlayer client.py not found at $CLIENT_FILE"
    exit 1
fi

# Backup original file
cp "$CLIENT_FILE" "$CLIENT_FILE.backup.$(date +%Y%m%d_%H%M%S)"
echo "Created backup of client.py"

# Apply patch - fix import statements
sed -i 's/from \.wrappers\.openai import OpenAIWrapper/from .wrappers.openai import OpenAI/' "$CLIENT_FILE"
sed -i 's/from \.wrappers\.ollama import OllamaWrapper/from .wrappers.ollama import Ollama/' "$CLIENT_FILE"
sed -i 's/from \.wrappers\.gemini import GeminiWrapper/from .wrappers.gemini import Gemini/' "$CLIENT_FILE"
sed -i 's/from \.wrappers\.claude import ClaudeWrapper/from .wrappers.claude import Claude/' "$CLIENT_FILE"

# Apply patch - fix wrapper usage
sed -i 's/return OpenAIWrapper(client=llm_client/return OpenAI(client=llm_client/' "$CLIENT_FILE"
sed -i 's/return OllamaWrapper(client_config=llm_client/return Ollama(client_config=llm_client/' "$CLIENT_FILE"
sed -i 's/return GeminiWrapper(client=llm_client/return Gemini(client=llm_client/' "$CLIENT_FILE"
sed -i 's/return ClaudeWrapper(client=llm_client/return Claude(client=llm_client/' "$CLIENT_FILE"

echo "✅ Patches applied successfully!"

# Verify patches
echo "Verifying patches..."
if grep -q "OpenAIWrapper" "$CLIENT_FILE"; then
    echo "❌ Warning: OpenAIWrapper still found in client.py"
    exit 1
fi

if grep -q "return OpenAI(" "$CLIENT_FILE"; then
    echo "✅ OpenAI wrapper usage patched"
else
    echo "❌ Warning: OpenAI wrapper usage not found"
fi

echo "Patch verification complete!"
echo ""
echo "Note: This patch will need to be reapplied after any Memlayer updates."
echo "You can run this script again to reapply the patches."