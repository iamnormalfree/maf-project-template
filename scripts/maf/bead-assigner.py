#!/usr/bin/env python3
"""
Simple bead assignment system using the mcp_agent_mail pattern
Works without needing the full MCP server
"""

import json
import os
import sys
import time
import subprocess
from pathlib import Path
from datetime import datetime, timedelta

class BeadAssigner:
    def __init__(self, agent_mail_dir=".agent-mail"):
        self.agent_mail_dir = Path(agent_mail_dir)
        self.reservations_dir = self.agent_mail_dir / "reservations"
        self.reservations_dir.mkdir(parents=True, exist_ok=True)

    def get_ready_beads(self):
        """Get list of ready beads from bd command (JSON; do not scrape text)."""
        try:
            result = subprocess.run(
                ["bd", "ready", "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                return []

            issues = json.loads(result.stdout or "[]")
            if not isinstance(issues, list):
                return []

            beads = []
            for issue in issues:
                bead_id = issue.get("id")
                status = issue.get("status")
                if isinstance(bead_id, str) and bead_id and status in {"open", "in-progress"}:
                    beads.append(bead_id)
            return beads
        except Exception as e:
            print(f"Error getting ready beads: {e}", file=sys.stderr)
            return []

    def is_bead_reserved(self, bead_id):
        """Check if a bead is already reserved"""
        reservation_file = self.reservations_dir / f"{bead_id}.json"
        return reservation_file.exists()

    def reserve_bead(self, bead_id, agent_id, duration_hours=4):
        """Reserve a bead for an agent"""
        if self.is_bead_reserved(bead_id):
            return False

        reservation = {
            "bead_id": bead_id,
            "agent_id": agent_id,
            "reserved_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=duration_hours)).isoformat(),
            "status": "reserved"
        }

        reservation_file = self.reservations_dir / f"{bead_id}.json"
        with open(reservation_file, 'w') as f:
            json.dump(reservation, f, indent=2)

        return True

    def release_bead(self, bead_id):
        """Release a bead reservation"""
        reservation_file = self.reservations_dir / f"{bead_id}.json"
        if reservation_file.exists():
            reservation_file.unlink()
            return True
        return False

    def assign_next_bead(self, agent_id):
        """Assign the next available bead to an agent"""
        ready_beads = self.get_ready_beads()

        for bead_id in ready_beads:
            if not self.is_bead_reserved(bead_id):
                if self.reserve_bead(bead_id, agent_id):
                    return bead_id

        return None

    def cleanup_expired_reservations(self):
        """Clean up expired reservations"""
        now = datetime.utcnow()

        for reservation_file in self.reservations_dir.glob("*.json"):
            try:
                with open(reservation_file) as f:
                    reservation = json.load(f)

                expires_at = datetime.fromisoformat(reservation["expires_at"])
                if now > expires_at:
                    reservation_file.unlink()
                    print(f"Cleaned up expired reservation for {reservation['bead_id']}")
            except Exception as e:
                print(f"Error cleaning up reservation {reservation_file}: {e}")

    def get_status(self):
        """Get current status of beads and reservations"""
        ready_beads = self.get_ready_beads()
        reserved_beads = []

        for reservation_file in self.reservations_dir.glob("*.json"):
            try:
                with open(reservation_file) as f:
                    reservation = json.load(f)
                reserved_beads.append(reservation)
            except:
                pass

        return {
            "ready_beads": ready_beads,
            "reserved_beads": reserved_beads,
            "available_beads": [b for b in ready_beads if not any(r["bead_id"] == b for r in reserved_beads)]
        }

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Bead Assignment System")
    parser.add_argument("command", choices=["ready", "reserve", "release", "assign", "status", "monitor", "cleanup"])
    parser.add_argument("--bead-id", help="Bead ID for reserve/release")
    parser.add_argument("--agent-id", help="Agent ID for assign/reserve")

    args = parser.parse_args()

    assigner = BeadAssigner()

    if args.command == "ready":
        beads = assigner.get_ready_beads()
        print("\n".join(beads))

    elif args.command == "reserve":
        if not args.bead_id or not args.agent_id:
            print("Error: --bead-id and --agent-id required for reserve")
            sys.exit(1)

        if assigner.reserve_bead(args.bead_id, args.agent_id):
            print(f"Reserved {args.bead_id} for {args.agent_id}")
        else:
            print(f"Failed to reserve {args.bead_id} (already reserved)")
            sys.exit(1)

    elif args.command == "release":
        if not args.bead_id:
            print("Error: --bead-id required for release")
            sys.exit(1)

        if assigner.release_bead(args.bead_id):
            print(f"Released reservation for {args.bead_id}")
        else:
            print(f"No reservation found for {args.bead_id}")

    elif args.command == "assign":
        if not args.agent_id:
            print("Error: --agent-id required for assign")
            sys.exit(1)

        bead_id = assigner.assign_next_bead(args.agent_id)
        if bead_id:
            print(bead_id)
        else:
            print("No available beads")
            sys.exit(1)

    elif args.command == "status":
        status = assigner.get_status()
        print(f"Ready beads: {len(status['ready_beads'])}")
        print(f"Reserved beads: {len(status['reserved_beads'])}")
        print(f"Available beads: {len(status['available_beads'])}")
        print("\nReserved:")
        for r in status['reserved_beads']:
            print(f"  {r['bead_id']} -> {r['agent_id']}")

    elif args.command == "monitor":
        print("Starting bead assignment monitor...")
        while True:
            for agent_id in ["implementor-1", "implementor-2", "implementor-3"]:
                bead_id = assigner.assign_next_bead(agent_id)
                if bead_id:
                    print(f"[{datetime.now().isoformat()}] Assigned {bead_id} to {agent_id}")

                    # Send message to tmux pane
                    pane_map = {"implementor-1": "0.1", "implementor-2": "0.2", "implementor-3": "0.3"}
                    if agent_id in pane_map:
                        subprocess.run([
                            "tmux", "send-keys", "-t", f"maf-5pane:{pane_map[agent_id]}",
                            f"echo 'Bead assigned: {bead_id}'", "Enter"
                        ], capture_output=True)

            assigner.cleanup_expired_reservations()
            time.sleep(30)

    elif args.command == "cleanup":
        assigner.cleanup_expired_reservations()
        print("Cleanup complete")

if __name__ == "__main__":
    main()
