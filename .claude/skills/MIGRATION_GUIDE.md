# Skills Migration Guide

## Option C: Skills-First with Fallback Implementation

This project implements a Skills-First architecture with fallback to the existing agents directory.

## Architecture Overview

```
User Input
    ↓
.claude/skills/pm-orchestrator.md (Priority 1)
    ↓ (if not found)
.claude/agents/pm-orchestrator.md (Fallback)
```

## Migration Phases

### Phase 1: Foundation (COMPLETED)
- ✅ SKILL.md format design and specification
- ✅ pm-orchestrator skill conversion
- ✅ Skills directory structure
- ✅ Settings.json skills configuration
- ✅ Documentation

### Phase 2: Subagent Migration (PENDING)
- ⏳ task-decomposer skill conversion
- ⏳ work-planner skill conversion
- ⏳ requirement-analyzer skill conversion
- ⏳ technical-designer skill conversion
- ⏳ implementer skill conversion
- ⏳ qa skill conversion
- ⏳ code-reviewer skill conversion
- ⏳ reporter skill conversion

### Phase 3: Integration & Testing (PENDING)
- ⏳ Fallback logic implementation
- ⏳ Settings.json integration testing
- ⏳ Hook compatibility verification
- ⏳ CLAUDE.md alignment check
- ⏳ End-to-end testing

## File Structure

```
.claude/
├── skills/                          # Primary location (Skills-First)
│   ├── README.md
│   ├── SKILL_FORMAT_SPEC.md
│   ├── MIGRATION_GUIDE.md
│   └── pm-orchestrator.md           # ✅ Migrated
├── agents/                          # Fallback location
│   ├── pm-orchestrator.md           # Keep for compatibility
│   ├── task-decomposer.md
│   ├── work-planner.md
│   └── ... (other agents)
├── hooks/
│   └── user-prompt-submit.sh
├── commands/
│   └── pm.md
├── settings.json                    # Updated with skills config
└── CLAUDE.md
```

## Configuration

### settings.json

```json
{
  "skills": {
    "directory": ".claude/skills",
    "fallbackDirectory": ".claude/agents",
    "enableFallback": true,
    "priority": "skills-first"
  }
}
```

### Lookup Order

1. Check `.claude/skills/<skill-name>.md`
2. If not found, check `.claude/agents/<skill-name>.md`
3. If neither found, report error

## Migration Process

### For Each Subagent

1. **Analyze**: Read existing `.claude/agents/<name>.md`
2. **Convert**: Transform to SKILL.md format
   - Add YAML frontmatter
   - Restructure content
   - Add capabilities and tools
3. **Validate**: Ensure compliance with SKILL_FORMAT_SPEC.md
4. **Test**: Verify functionality
5. **Document**: Update migration status

### Conversion Checklist

- [ ] YAML frontmatter with all required fields
- [ ] skill identifier matches filename
- [ ] version follows semver
- [ ] capabilities list complete
- [ ] tools list accurate
- [ ] priority and activation mode set
- [ ] All required sections present
- [ ] Examples and integration points documented
- [ ] Backward compatibility maintained

## Testing Strategy

### Unit Testing
- Validate YAML frontmatter
- Check required sections
- Verify skill identifier matches filename

### Integration Testing
- Test Skills-First lookup
- Test fallback mechanism
- Test with pm-orchestrator orchestration

### End-to-End Testing
- Full user input → pm-orchestrator → subagents flow
- Verify hook compatibility
- Verify CLAUDE.md alignment

## Rollback Plan

If issues arise:

1. **Immediate**: Skills are read-only, agents still work
2. **Disable**: Set `enableFallback: false` in settings.json
3. **Revert**: Remove skills directory, revert settings.json

## Compatibility Matrix

| Component | Skills-First | Fallback | Status |
|-----------|--------------|----------|--------|
| pm-orchestrator | ✅ | ✅ | Ready |
| task-decomposer | ⏳ | ✅ | Pending |
| work-planner | ⏳ | ✅ | Pending |
| requirement-analyzer | ⏳ | ✅ | Pending |
| technical-designer | ⏳ | ✅ | Pending |
| implementer | ⏳ | ✅ | Pending |
| qa | ⏳ | ✅ | Pending |
| code-reviewer | ⏳ | ✅ | Pending |
| reporter | ⏳ | ✅ | Pending |

## Phase 1 Completion Criteria

- [x] SKILL.md format specification complete
- [x] pm-orchestrator converted to skill
- [x] Skills directory structure created
- [x] settings.json updated
- [x] Documentation complete
- [ ] Phase 1 testing complete
- [ ] User approval to proceed to Phase 2

## Next Steps

After Phase 1 approval:

1. Begin Phase 2: Subagent Migration
2. Convert 8 remaining subagents
3. Test each conversion
4. Update compatibility matrix

## References

- SKILL_FORMAT_SPEC.md - Complete format specification
- pm-orchestrator.md - Reference implementation
- ../agents/*.md - Original agent definitions
