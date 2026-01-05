#!/usr/bin/env node
/**
 * Proposal Manager for Agent Coordination Governance
 *
 * Manages CRUD operations for work proposals in .beads/proposals.jsonl
 */

import fs from 'fs';

const PROPOSALS_FILE = '/root/projects/roundtable/.beads/proposals.jsonl';

/**
 * Generate proposal ID with timestamp
 */
function generateProposalId() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `prop-${date}-${random}`;
}

/**
 * Create a new proposal
 */
function createProposal(data) {
  // Validate required fields
  const required = ['title', 'description', 'proposed_beads', 'classification', 'created_by'];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate classification
  if (!['tactical', 'strategic', 'multi_epic'].includes(data.classification)) {
    throw new Error(`Invalid classification: ${data.classification}`);
  }

  // Create proposal object
  const proposal = {
    id: generateProposalId(),
    created_at: new Date().toISOString(),
    created_by: data.created_by,
    classification: data.classification,
    title: data.title,
    description: data.description,
    proposed_beads: data.proposed_beads,
    rationale: data.rationale || '',
    impact_assessment: data.impact_assessment || {
      scope: 'unknown',
      affected_systems: [],
      estimated_hours: 0,
      priority: 2,
    },
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_notes: null,
    created_beads: [],
  };

  // Append to proposals.jsonl
  const line = JSON.stringify(proposal) + '\n';
  fs.appendFileSync(PROPOSALS_FILE, line);

  return proposal;
}

/**
 * Read proposal by ID
 */
function readProposal(proposalId) {
  const content = fs.readFileSync(PROPOSALS_FILE, 'utf8');
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const proposal = JSON.parse(line);
      // Skip lines that aren't valid proposals (no id field)
      if (!proposal.id) continue;
      if (proposal.id === proposalId) {
        return proposal;
      }
    } catch (e) {
      // Skip invalid JSON lines
      continue;
    }
  }

  return null;
}

/**
 * Update proposal status
 */
function updateProposalStatus(proposalId, updates) {
  const content = fs.readFileSync(PROPOSALS_FILE, 'utf8');
  const lines = content.trim().split('\n');
  const newLines = [];

  let found = false;
  for (const line of lines) {
    if (!line.trim()) {
      newLines.push(line);
      continue;
    }

    try {
      const proposal = JSON.parse(line);
      // Preserve non-proposal lines without id field
      if (!proposal.id) {
        newLines.push(line);
        continue;
      }
      if (proposal.id === proposalId) {
        found = true;
        const updated = { ...proposal, ...updates };
        newLines.push(JSON.stringify(updated));
      } else {
        newLines.push(line);
      }
    } catch (e) {
      // Preserve invalid JSON lines as-is
      newLines.push(line);
    }
  }

  if (!found) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  fs.writeFileSync(PROPOSALS_FILE, newLines.join('\n') + '\n');
  return readProposal(proposalId);
}

/**
 * List proposals with optional filtering
 */
function listProposals(filters = {}) {
  const content = fs.readFileSync(PROPOSALS_FILE, 'utf8');
  const lines = content.trim().split('\n');

  const proposals = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const proposal = JSON.parse(line);
      // Only include valid proposals (must have id field)
      if (proposal.id) {
        proposals.push(proposal);
      }
    } catch (e) {
      // Skip invalid JSON lines
      continue;
    }
  }

  // Apply filters
  let filtered = proposals;
  if (filters.status) {
    filtered = filtered.filter(p => p.status === filters.status);
  }
  if (filters.created_by) {
    filtered = filtered.filter(p => p.created_by === filters.created_by);
  }
  if (filters.classification) {
    filtered = filtered.filter(p => p.classification === filters.classification);
  }

  return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * CLI interface
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'create':
        // Read proposal data from stdin or file
        let inputData = '';
        if (process.stdin.isTTY) {
          // Read from file argument
          const file = args[1];
          inputData = fs.readFileSync(file, 'utf8');
        } else {
          // Read from stdin
          inputData = fs.readFileSync(0, 'utf8');
        }
        const data = JSON.parse(inputData);
        const proposal = createProposal(data);
        console.log(JSON.stringify(proposal, null, 2));
        break;

      case 'read':
        const prop = readProposal(args[1]);
        if (!prop) {
          console.error(`Proposal not found: ${args[1]}`);
          process.exit(1);
        }
        console.log(JSON.stringify(prop, null, 2));
        break;

      case 'update':
        const updateData = JSON.parse(args[2]);
        const updated = updateProposalStatus(args[1], updateData);
        console.log(JSON.stringify(updated, null, 2));
        break;

      case 'list':
        const filters = {};
        for (let i = 1; i < args.length; i += 2) {
          filters[args[i].substring(2)] = args[i + 1];
        }
        const proposals = listProposals(filters);
        console.log(JSON.stringify(proposals, null, 2));
        break;

      default:
        console.error('Usage: proposal-manager.mjs <create|read|update|list> [args...]');
        console.error('');
        console.error('Commands:');
        console.error('  create <file.json>    - Create proposal from JSON file');
        console.error('  read <id>             - Read proposal by ID');
        console.error('  update <id> <data>    - Update proposal (JSON)');
        console.error('  list [--filter val]  - List proposals with optional filters');
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
main();

export {
  createProposal,
  readProposal,
  updateProposalStatus,
  listProposals,
  generateProposalId,
};
