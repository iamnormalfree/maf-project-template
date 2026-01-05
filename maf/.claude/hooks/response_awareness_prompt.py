#!/usr/bin/env python3
import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        return 0
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        # If we can't parse, pass through unchanged.
        sys.stdout.write(raw)
        return 0

    prompt = payload.get("prompt", "")
    if isinstance(prompt, str) and prompt.startswith("/response-awareness"):
        suffix = (
            "\n\nOrchestrate only, do not implement. "
            "Follow the response awareness framework exactly step by step."
        )
        if suffix.strip() not in prompt:
            payload["prompt"] = f"{prompt}{suffix}"

    sys.stdout.write(json.dumps(payload, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
