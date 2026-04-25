/**
 * Skills Routes
 *
 * Provides skill auto-generation endpoints:
 * POST /api/skills/generate - Scan project and generate Claude Code Skills
 *
 * Supports dry-run mode for previewing generated skills without writing.
 *
 * ============================================================================
 * IMPORTANT: TEMPLATE-BASED SCAFFOLD - NOT AI-POWERED (Batch 4)
 * ============================================================================
 *
 * This route is *NOT* an LLM endpoint. `generateSkills()` from `src/skills/`
 * produces a fixed set of project-aware templates (project-conventions / test
 * / deploy / project-safety, etc.) by inspecting `package.json`, `tsconfig.json`,
 * `Cargo.toml`, etc. There is **no** call to OpenAI / Anthropic / any LLM, no
 * API key requirement, and the output is **deterministic** (same input -> same
 * output, byte-for-byte).
 *
 * If you are looking for AI-powered, natural-language skill / agent / command
 * generation, that lives in `src/web/routes/assistant.ts`:
 *
 *     POST /api/assistant/propose
 *
 * which calls `generateProposal()` and routes to the configured LLM provider.
 * See `spec/37_AI_GENERATE.md` for that flow, and section
 * "Skills: Template Scaffold vs AI Generate" in `spec/19_WEB_UI.md` for the
 * side-by-side comparison.
 *
 * Cost / quality implications:
 *   - This endpoint:           ¥0,        deterministic
 *   - /api/assistant/propose:  $$ per call (model-dependent), non-deterministic
 *
 * To make the distinction visible to clients, every successful response from
 * this endpoint includes `template: true`. Clients (CLI, UI, integration
 * scripts) MUST NOT treat this output as if it came from an LLM.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { scanProject, generateSkills, writeSkills } from '../../skills';

export interface SkillsRoutesConfig {
  projectRoot: string;
}

export function createSkillsRoutes(config: SkillsRoutesConfig): Router {
  const router = Router();
  const { projectRoot } = config;

  /**
   * POST /api/skills/generate
   *
   * Body:
   *   projectPath?: string  - Path to scan (defaults to projectRoot)
   *   dryRun?: boolean      - If true, return generated content without writing
   *
   * Response:
   *   { scan, skills, written?, dryRun?, message?, template: true }
   *
   * The `template: true` marker is always present and signals that the output
   * is a deterministic template scaffold, not an LLM generation. See file
   * header for the rationale and the comparison with /api/assistant/propose.
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const targetPath = req.body.projectPath || projectRoot;
      const dryRun = req.body.dryRun === true;

      const scanResult = scanProject(targetPath);
      const skills = generateSkills(targetPath, scanResult);

      if (!dryRun) {
        const written = writeSkills(targetPath, skills);
        return res.json({
          scan: scanResult,
          skills: skills.map((s) => ({ name: s.name, directory: s.directory })),
          written,
          message: `Generated ${skills.length} skills in ${targetPath}/.claude/skills/`,
          // Template marker: this output is NOT from an LLM. See file header.
          template: true,
        });
      } else {
        return res.json({
          scan: scanResult,
          skills: skills.map((s) => ({
            name: s.name,
            directory: s.directory,
            content: s.skillMdContent,
          })),
          dryRun: true,
          // Template marker: this output is NOT from an LLM. See file header.
          template: true,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'SKILL_GENERATION_FAILED', message });
    }
  });

  return router;
}
