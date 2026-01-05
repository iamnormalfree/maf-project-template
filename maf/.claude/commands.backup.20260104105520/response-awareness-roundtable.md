# Response Awareness for Roundtable

Use this command for complex roundtable development tasks involving the email publishing system, multi-agent coordination, or cross-system integration.

## Quick Start

**Simple roundtable tasks (1-2 files)**: Just do them manually, no framework needed.

**Moderate complexity (3-5 files with coordination)**:
```
/response-awareness-light [roundtable task description]
```

**Complex tasks (multi-system, email workflow, publishing pipeline)**:
```
/response-awareness [roundtable task description]
```

## Roundtable-Specific Considerations

When using this framework for roundtable development:

### Key Integration Points
- **Email ingestion** with plus token parsing
- **LLM drafting** with schema validation
- **Approval workflow** with secure tokens
- **Git publishing** pipeline
- **Eleventy site** generation

### When to Use for Roundtable

Use this framework when:
- Modifying email → draft → approval → publish pipeline
- Changing database schema or migrations
- Updating LLM prompts or validation
- Modifying approval token system
- Changing Git publishing workflow
- Updating Eleventy templates or build process

### Example Usages

```
/response-awareness "Add attachment support to inbound email processing with new validation and draft generation"

/response-awareness "Implement post expiration system with automated cleanup and notification emails"

/response-awareness "Enhance LLM drafting to support multiple content types with schema validation"
```

## Available Skills for Roundtable

The framework includes specialized skills for roundtable development:
- Email parsing and validation
- Database schema design
- LLM integration
- Security token management
- Git automation
- Static site generation