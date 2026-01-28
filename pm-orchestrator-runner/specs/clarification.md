# Clarification Specification

## Tier-0 Rule I: No Repeat Clarification

Once a user has answered a clarification question, the system MUST NOT
ask the same question again within the same session. If the same
clarification arises, the system auto-applies the previous answer.

**Testable**: Second identical clarification is auto-resolved without user prompt.

---

## Clarification Types

Every clarification MUST have a typed category:

```typescript
export type ClarificationType =
  | 'TARGET_FILE'    // Which file to operate on
  | 'SELECT_ONE'     // Choose one from a list
  | 'CONFIRM'        // Yes/no confirmation
  | 'FREE_TEXT';     // Open-ended text input
```

### Mapping to UI

| ClarificationType | UI Component |
|-------------------|-------------|
| TARGET_FILE | InteractivePicker (file list) |
| SELECT_ONE | InteractivePicker (option list) |
| CONFIRM | InteractivePicker (["Yes", "No"]) |
| FREE_TEXT | Standard readline input |

### Mapping from ClarificationReason

Existing `ClarificationReason` values map to types:

| ClarificationReason | ClarificationType |
|---------------------|-------------------|
| target_file_exists | CONFIRM |
| target_file_ambiguous | TARGET_FILE |
| target_action_ambiguous | SELECT_ONE |
| missing_required_info | FREE_TEXT |

---

## Semantic Resolver

Before presenting a clarification, the system checks whether the user's
prior input already contains a recognisable answer.

### Built-in Patterns

| Pattern | Resolves to |
|---------|------------|
| "root", "root直下", ".", "ここ", "here" | Project root directory |
| "yes", "はい", "y" | Affirmative (for CONFIRM) |
| "no", "いいえ", "n" | Negative (for CONFIRM) |
| Exact file path match | The matched file (for TARGET_FILE) |

### Resolution Flow

```
1. Receive clarification request (question, type, options)
2. Check semantic resolver against user's last input
3. If match found -> auto-resolve, skip picker
4. If no match -> present picker (or readline for FREE_TEXT)
```

---

## Repeat-Clarification Guard

### Data Structure

```typescript
interface ClarificationHistoryEntry {
  questionHash: string;       // SHA-256 of normalised question text
  clarificationType: ClarificationType;
  answer: string;
  timestamp: number;
}
```

### Algorithm

```
1. Compute questionHash for new clarification
2. Search history for matching questionHash
3. If found -> auto-apply stored answer, log "[auto-resolved]"
4. If not found -> present to user, store answer in history
```

### Normalisation

Before hashing, the question text is normalised:
- Lowercase
- Trim whitespace
- Remove trailing punctuation (?, !, .)
- Collapse multiple spaces

---

## Implementation References
- ClarificationType: `src/models/clarification.ts` (Phase 0-C deliverable)
- Semantic resolver: `src/repl/semantic-resolver.ts` (Phase 0-C deliverable)
- Repeat guard: `src/repl/clarification-history.ts` (Phase 0-C deliverable)
- Existing ClarificationReason: `src/mediation/llm-mediation-layer.ts`
