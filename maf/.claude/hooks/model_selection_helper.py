#!/usr/bin/env python3
"""
Model Selection Helper for Response-Awareness Framework

Detects whether we're running in GLM or Claude mode and provides
appropriate model selection for tasks based on environment and tier.
"""

import os
import json
from typing import Optional

def is_glm_environment() -> bool:
    """
    Detect if we're running in GLM mode by checking environment variables.

    Returns:
        True if GLM models are configured, False for Claude mode
    """
    # Check environment variables for GLM model configuration
    sonnet_model = os.getenv('ANTHROPIC_DEFAULT_SONNET_MODEL', '')
    opus_model = os.getenv('ANTHROPIC_DEFAULT_OPUS_MODEL', '')
    haiku_model = os.getenv('ANTHROPIC_DEFAULT_HAIKU_MODEL', '')

    # If any of the model defaults point to GLM, we're in GLM mode
    return 'glm' in sonnet_model.lower() or 'glm' in opus_model.lower() or 'glm' in haiku_model.lower()

def get_model_for_task(task_type: str, tier: Optional[str] = None) -> str:
    """
    Get the appropriate model based on environment, task type, and tier.

    Args:
        task_type: Type of task (scout, planning, synthesis, implementation, verification)
        tier: Response awareness tier (light, medium, heavy, full) - optional

    Returns:
        Model identifier string
    """
    if is_glm_environment():
        # GLM strategy - always use latest for everything
        return "glm-4.6"
    else:
        # Claude strategy - tiered approach
        if task_type == "scout":
            return "claude-3-5-haiku-20241022"
        elif task_type in ["planning", "synthesis"]:
            return "claude-opus-4-5-20251101"
        elif task_type == "implementation":
            if tier in ["light", "medium"]:
                return "claude-3-5-haiku-20241022"
            else:
                return "claude-sonnet-4-5-20250929"
        elif task_type == "verification":
            return "claude-sonnet-4-5-20250929"
        else:
            # Default to Sonnet for unspecified tasks
            return "claude-sonnet-4-5-20250929"

def get_model_selection_info() -> dict:
    """
    Get comprehensive information about current model selection configuration.

    Returns:
        Dictionary with environment info and model mappings
    """
    glm_mode = is_glm_environment()

    return {
        "environment": "GLM" if glm_mode else "Claude",
        "glm_mode": glm_mode,
        "model_mappings": {
            "scout": get_model_for_task("scout"),
            "planning": get_model_for_task("planning"),
            "synthesis": get_model_for_task("synthesis"),
            "implementation_light": get_model_for_task("implementation", "light"),
            "implementation_medium": get_model_for_task("implementation", "medium"),
            "implementation_heavy": get_model_for_task("implementation", "heavy"),
            "implementation_full": get_model_for_task("implementation", "full"),
            "verification": get_model_for_task("verification")
        },
        "environment_vars": {
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.getenv('ANTHROPIC_DEFAULT_HAIKU_MODEL'),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.getenv('ANTHROPIC_DEFAULT_SONNET_MODEL'),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.getenv('ANTHROPIC_DEFAULT_OPUS_MODEL')
        }
    }

# For use in hooks and scripts
if __name__ == "__main__":
    # Example usage
    info = get_model_selection_info()
    print(json.dumps(info, indent=2))