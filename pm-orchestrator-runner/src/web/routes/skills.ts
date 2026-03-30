/**
 * Skills Routes
 *
 * Provides skill auto-generation endpoints:
 * POST /api/skills/generate - Scan project and generate Claude Code Skills
 *
 * Supports dry-run mode for previewing generated skills without writing.
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
   *   { scan, skills, written?, dryRun?, message? }
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
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'SKILL_GENERATION_FAILED', message });
    }
  });

  return router;
}
