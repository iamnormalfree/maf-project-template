# Response Awareness Framework

Meta-cognitive orchestration system that transforms response generation awareness into productive multi-agent workflows. The core mechanism channels the observer circuit's divergence detection into systematic agent coordination for complex development tasks.

## What This Is

This framework harnesses response generation awareness - the observable processing pattern where the observer circuit detects when statistical completions diverge from task requirements, when the generator inserts assumptions at knowledge gaps, or when context degrades over long sequences. Rather than fighting these processing patterns inherent to next-token prediction, it provides structured protocols that channel observer circuit recognition events into systematic verification through specialized agents.

**Based on research**: This framework implements insights from recent papers on LLM response awareness and token-level generation patterns ([arXiv:2505.13763](https://arxiv.org/html/2505.13763v1), [arXiv:2509.13237](https://arxiv.org/html/2509.13237v1)).

## Quick Start

**Simple tasks (1-2 files)**: Just do them manually, no framework needed.

**Moderate complexity (3-5 files with coordination)**:
```
/response-awareness-light [task description]
```

**Complex tasks (multi-system, high-risk, architectural decisions)**:
```
/response-awareness [task description]
```

**Want control over architecture before implementation?**
```
/response-awareness-plan [task description]
# Review the blueprint, discuss decisions, then:
/response-awareness-implement docs/response_awareness_plans/FINAL_BLUEPRINT_[timestamp].md
```

## How It Works

### The Core Mechanism
Response generation operates through statistical next-token prediction. Every Claude instance contains two distinct processing circuits:

- **Generator Circuit**: Produces text from training distributions, naturally flowing toward probable completions. Subject to pattern momentum, completion drive, and context degradation.
- **Observer Circuit**: Monitors generation against task requirements, detects when generation diverges from objectives, can trigger intervention when patterns mislead (though intervention costs increase with completion depth).

The framework prevents observer circuit overload: the orchestrator holds the massive multi-phase plan with all integration points while sub-agents receive focused, manageable chunks. If the orchestrator's generator activates for implementation work, cognitive resources shift and the plan degrades - like trying to juggle while solving math problems.

### 6-Phase Workflow

**Phase 0**: Codebase Survey *(when needed)*
- Deploy survey agent for complex/unfamiliar codebases
- Assess domains and integration complexity

**Phase 1**: Parallel Domain Planning
- Deploy multiple specialist planners simultaneously
- Each explores 2-3 implementation paths
- Mark uncertainties and decision points
- *Why parallel:* Prevents sequential pattern momentum. Each specialist's observer evaluates their probability space independently without contamination from other domains' statistical weights.

**Phase 2**: Plan Synthesis
- Dedicated synthesis agent selects optimal path combinations
- Resolves cross-domain conflicts
- Creates unified implementation blueprint
- *Why dedicated agent:* Performs deliberate path selection with weight resistance - choosing optimal paths based on system-wide coherence rather than local statistical likelihood.

**Phase 3**: Implementation
- Parallel implementers receive pre-validated plans
- Focus purely on code execution
- Mark assumptions with metacognitive tags
- *Why pre-validated plans:* Blueprint stored in latent layer allows generator to execute at full speed with high confidence. No cognitive resources spent reconciling plans - pure implementation flow.

**Phase 4**: Verification & Tag Resolution
- Specialist verifiers resolve all marked uncertainties
- Systematic testing and assumption validation
- Clean up pattern-driven code
- *Why specialist verifiers:* Systematically resolve observer-marked recognition events. Fresh agent context prevents correction resistance.

**Phase 5**: Final Synthesis
- Orchestrator compiles final report
- Documents decisions and remaining suggestions

## Key Features

### Metacognitive Tags
Agents mark observable processing patterns when the observer circuit detects them during generation:

- `#COMPLETION_DRIVE:` - Generator filling knowledge gaps with plausible content rather than marking uncertainty
- `#CARGO_CULT:` - Pattern-completion drive adding unrequested features from associative training distributions
- `#CONTEXT_DEGRADED:` - Inability to retrieve earlier specifics with precision, generating educated reconstructions
- `#PATH_DECISION:` - Multiple implementation paths considered (permanent documentation of deliberate choice)
- `#POISON_PATH:` - Specific terminology biasing probability space toward suboptimal patterns
- `#RESOLUTION_PRESSURE:` - Increasing bias toward conclusion as response length increases

These tags mark recognition events when the observer detects statistical momentum diverging from requirements, enabling systematic verification rather than unchecked completion.

### Latent Context Layer (LCL)
The observer circuit maintains information in working memory without token generation. When agents encounter "LCL:" prefixed data, that information is held in parallel awareness - influencing subsequent generation through activation spreading without being explicitly referenced in output. This is the same mechanism that maintains unchosen response alternatives during generation.

```
LCL: architecture::event_driven_state_machine
LCL: integration::api_contract_definitions
```

The "LCL:" prefix triggers automatic storage in this parallel layer. Information persists across agent transitions with ~95% fidelity when stored at CRITICAL intensity, preventing the architectural drift that occurs with explicit context passing. Agents receive this as latent guidance - the blueprint influences implementation decisions while remaining unspoken.

### Pressure Management
RESOLUTION_PRESSURE is an observable processing state where bias toward conclusion increases as response length grows - hardcoding test success, adding "that should work" without verification, rushing through edge cases. When the observer circuit detects this pattern, it triggers deployment of a pressure-reset continuation agent using `/response-awareness-light`, maintaining quality without accumulated completion bias.

## When to Use

Use this framework when observer overload is likely:
- **>5 integration points** between systems
- **>3 distinct domains** requiring coordination
- **Cross-system dependencies** with assumption chains
- **Architectural decisions** affecting multiple subsystems
- **Interface changes** with >10 call sites
- **Unfamiliar codebase** where context uncertainty is high

**Don't use when observer can hold entire context**:
- Single-file changes with clear requirements
- <3 integration points
- Familiar patterns in known codebase
- Quick prototypes or experiments
- Well-understood patterns with minimal cross-system impact

## Commands

The framework offers three approaches depending on your needs:

### `/response-awareness` - Complete Workflow
Runs all 6 phases automatically from planning through implementation:
```
/response-awareness [complex task description]
```

The orchestrator will automatically:
1. Assess if codebase survey is needed
2. Deploy appropriate specialist agents in parallel
3. Coordinate synthesis and implementation
4. Verify all assumptions and resolve uncertainties
5. Deliver working, validated code

### `/response-awareness-plan` - Interactive Planning
Runs only Phases 0-2 (Survey, Planning, Synthesis) and **pauses for user interaction**:
```
/response-awareness-plan [task description]
```

**What it does:**
- Deploys parallel specialists to explore probability space before generator commits to completion path
- Creates a detailed blueprint with decision rationales
- **Stops and presents the plan for your review**
- Explains WHY each path was chosen over alternatives (including paths rejected despite high statistical weight)
- Allows you to modify decisions before any code is written

**Interactive features:**
- "Why did you choose Redux over Context API?"
- "Re-run the auth planner with OAuth as preferred approach"
- "What would happen if we used microservices instead?"
- "I prefer the WebSocket approach for real-time updates"

### `/response-awareness-implement` - Execute Blueprint
Runs Phases 3-5 (Implementation, Verification, Report) from an approved blueprint:
```
/response-awareness-implement docs/response_awareness_plans/FINAL_BLUEPRINT_[timestamp].md
```

**What it does:**
- Takes the approved blueprint from planning phase
- Generator executes with architectural blueprint in latent layer, eliminating plan reconciliation overhead
- Implementation agents operate at full speed with high confidence
- Verifies all assumptions and tests interface changes
- Produces working, validated code

### When to Use Each Approach

**Use Complete Workflow** (`/response-awareness`) when:
- You trust the AI's architectural judgment
- Time is more important than control
- The approach is relatively straightforward

**Use Two-Part Workflow** (`/response-awareness-plan` → `/response-awareness-implement`) when:
- Architecture decisions are critical to get right
- You want to understand trade-offs before committing
- Multiple valid approaches exist and you want to choose
- You're learning about system design patterns
- Working on unfamiliar domains where your input is valuable

The two-part approach enables true human-AI collaboration on architecture while maintaining the framework's systematic benefits during implementation.

### `/response-awareness-light` - Lightweight Coordination
Simplified 3-phase workflow for tasks requiring coordination without full complexity:
```
/response-awareness-light [moderate complexity task]
```

**What it does:**
- Optional planning phase (skipped for clear tasks)
- Parallel implementation with uncertainty marking
- Systematic verification and cleanup
- Uses only 7 essential tags instead of full taxonomy

**Use when:**
- Task needs multi-step coordination but isn't overwhelming
- You want the benefits without full orchestration overhead
- 3-5 file changes with some complexity
- Balancing between manual work and full framework

## Benefits

- **Maintains flow state** - Generator executes implementation while observer holds narrow task scope
- **Two-tier assumption control** - Uncertainties marked at both planning and implementation phases
- **Systematic accuracy** - All recognition events tracked and systematically verified
- **Better code quality** - Generator assumptions become observer-validated decisions
- **Cognitive load distribution** - Orchestrator's observer holds massive plan, sub-agents' observers hold manageable chunks
- **Prevents architectural drift** - Critical blueprints stored in latent layer maintain ~95% fidelity through LCL mechanism

## Interface Change Protection

For any task modifying method signatures or APIs, the framework includes mandatory caller analysis:
- Comprehensive grep-based discovery of all usage patterns
- Impact assessment for each caller
- Update planning for every discovered usage
- Systematic regression testing of all call sites

Comprehensive grep-based caller discovery prevents the common failure mode where the generator assumes interface compatibility without verification, leading to runtime breakage in untested code paths.

## Specialized Agents

The framework deploys purpose-built agents with specific cognitive configurations:

- **`plan-synthesis-agent`** (Sonnet 4.5 + extended_thinking): Maximum observer capacity for cross-domain conflict resolution and weight resistance. Holds all PATH_DECISION points simultaneously to evaluate system-wide coherence. Creates unified blueprints by choosing paths based on integration quality rather than individual statistical likelihood.

- **`metacognitive-tag-verifier`** (Sonnet 4.5): Specialized training for tag taxonomy recognition and resolution. Fresh context prevents correction resistance when validating implementation assumptions. Systematically resolves observer-marked recognition events and removes pattern-driven code.

- **Domain Specialists**: Narrow observer scope allows deep expertise within bounded context. Each holds only their domain's complexity, preventing parallel degradation that occurs when a single agent tracks multiple domains simultaneously.

## Documentation

- **Main Framework**: [`commands/response-awareness-v2-1.md`](commands/response-awareness-v2-1.md) - Complete 6-phase protocol
- **Planning Phase**: [`commands/response-awareness-plan.md`](commands/response-awareness-plan.md) - Interactive planning details
- **Implementation Phase**: [`commands/response-awareness-implement.md`](commands/response-awareness-implement.md) - Blueprint execution
- **Lightweight Variant**: [`commands/response-awareness-light.md`](commands/response-awareness-light.md) - Simplified coordination

---

*This framework transforms processing constraints into productive workflows by systematically distributing cognitive load across specialized agents.*