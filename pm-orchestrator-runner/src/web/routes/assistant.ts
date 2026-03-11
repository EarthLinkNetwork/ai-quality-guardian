/**
 * Assistant Routes
 *
 * Provides LLM-powered proposal generation, apply engine,
 * and plugin CRUD for the Assistant feature.
 *
 * Follows the same route factory pattern as claude-hooks.ts.
 */

import { Router, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import {
  ProposalPlanSet,
  ProposalChoice,
  ProposalArtifact,
  ApplyResult,
  PluginDefinition,
  GoldenCase,
  GoldenEvalResult,
  GoldenEvalReport,
} from "../dal/types";

export interface AssistantRoutesConfig {
  projectRoot: string;
  stateDir: string;
  globalClaudeDir?: string;
}

export function createAssistantRoutes(config: AssistantRoutesConfig): Router {
  const router = Router();
  const { projectRoot, stateDir, globalClaudeDir } = config;

  // ===== LLM Propose =====
  // POST /api/assistant/propose
  router.post("/propose", async (req: Request, res: Response) => {
    try {
      const { prompt, scope } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res
          .status(400)
          .json({ error: "VALIDATION_ERROR", message: "prompt is required" });
      }
      const effectiveScope = scope || "project";

      // Mock mode for E2E tests
      if (req.query.mock === "true") {
        const mockPlan = createMockProposal(prompt, effectiveScope);
        return res.json(mockPlan);
      }

      // Real LLM call (inject repoProfile if available)
      const plan = await generateProposal(prompt, effectiveScope, projectRoot, req.body.repoProfile);
      return res.json(plan);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate proposal";
      return res.status(500).json({ error: "LLM_ERROR", message });
    }
  });

  // ===== Validate (dry-run) =====
  // POST /api/assistant/validate
  router.post("/validate", async (req: Request, res: Response) => {
    try {
      const { choice } = req.body as { choice: ProposalChoice };
      if (!choice || !choice.artifacts) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "choice with artifacts is required",
        });
      }
      const errors = validateChoice(choice);
      if (errors.length > 0) {
        return res.status(422).json({
          error: "PLAN_VALIDATION_FAILED",
          message: "Plan failed safety checks",
          validationErrors: errors,
        });
      }
      return res.json({ valid: true, validationErrors: [] });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Validation error";
      return res.status(500).json({ error: "VALIDATION_ERROR", message });
    }
  });

  // ===== Apply =====
  // POST /api/assistant/apply
  router.post("/apply", async (req: Request, res: Response) => {
    try {
      const { choice } = req.body as { choice: ProposalChoice };
      if (!choice || !choice.artifacts) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "choice with artifacts is required",
        });
      }
      // Mandatory pre-apply validation
      const validationErrors = validateChoice(choice);
      if (validationErrors.length > 0) {
        return res.status(422).json({
          error: "PLAN_VALIDATION_FAILED",
          message: "Plan failed safety checks",
          validationErrors,
          success: false,
          created: [],
          updated: [],
          deleted: [],
          errors: validationErrors,
        });
      }
      const result = await applyChoice(choice, projectRoot, globalClaudeDir);
      return res.json(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to apply";
      return res.status(500).json({ error: "APPLY_ERROR", message });
    }
  });

  // ===== Plugins CRUD =====
  const pluginsDir = path.join(stateDir, "plugins");

  // POST /api/assistant/plugins (save as plugin)
  router.post("/plugins", async (req: Request, res: Response) => {
    try {
      const { name, description, choice, sourcePrompt, sourcePlanSetId, tags, category, author } =
        req.body;
      if (!name || !choice) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "name and choice are required",
        });
      }
      await fs.mkdir(pluginsDir, { recursive: true });
      const plugin: PluginDefinition = {
        pluginId: `plugin_${randomUUID()}`,
        name,
        version: "1.0.0",
        description: description || "",
        scope: choice.scope || "project",
        artifacts: choice.artifacts || [],
        installPlan: choice.applySteps || [],
        uninstallPlan: choice.rollbackSteps || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        installed: false,
        sourcePrompt,
        sourcePlanSetId,
        sourceChoiceId: choice.choiceId,
        tags: tags || [],
        category: category || "",
        author: author || "",
      };
      await fs.writeFile(
        path.join(pluginsDir, `${plugin.pluginId}.json`),
        JSON.stringify(plugin, null, 2)
      );
      return res.status(201).json(plugin);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: "SAVE_ERROR", message });
    }
  });

  // GET /api/assistant/plugins/search?q=&tags=&category=  (MUST be before /:id)
  router.get("/plugins/search", async (req: Request, res: Response) => {
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
      const files = await fs.readdir(pluginsDir);
      let plugins: PluginDefinition[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const data = await fs.readFile(path.join(pluginsDir, file), "utf-8");
          plugins.push(JSON.parse(data));
        }
      }

      const q = ((req.query.q as string) || "").toLowerCase();
      const tags = (req.query.tags as string || "").split(",").filter(Boolean);
      const category = (req.query.category as string) || "";

      if (q) {
        plugins = plugins.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            (p.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      if (tags.length > 0) {
        plugins = plugins.filter((p) =>
          tags.some((t) => (p.tags || []).includes(t))
        );
      }
      if (category) {
        plugins = plugins.filter((p) => p.category === category);
      }

      plugins.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return res.json({ items: plugins, total: plugins.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      return res.status(500).json({ error: "SEARCH_ERROR", message });
    }
  });

  // GET /api/assistant/plugins (list)
  router.get("/plugins", async (_req: Request, res: Response) => {
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
      const files = await fs.readdir(pluginsDir);
      const plugins: PluginDefinition[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const data = await fs.readFile(path.join(pluginsDir, file), "utf-8");
          plugins.push(JSON.parse(data));
        }
      }
      plugins.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return res.json({ items: plugins });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: "LIST_ERROR", message });
    }
  });

  // GET /api/assistant/plugins/:id
  router.get("/plugins/:id", async (req: Request, res: Response) => {
    try {
      const filePath = path.join(pluginsDir, `${req.params.id}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      return res.json(JSON.parse(data));
    } catch {
      return res
        .status(404)
        .json({ error: "NOT_FOUND", message: "Plugin not found" });
    }
  });

  // POST /api/assistant/plugins/:id/install
  router.post("/plugins/:id/install", async (req: Request, res: Response) => {
    try {
      const filePath = path.join(pluginsDir, `${req.params.id}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      const plugin: PluginDefinition = JSON.parse(data);

      // Apply artifacts
      const result = await applyChoice(
        {
          choiceId: plugin.sourceChoiceId || plugin.pluginId,
          title: plugin.name,
          summary: plugin.description,
          scope: plugin.scope,
          artifacts: plugin.artifacts,
          applySteps: plugin.installPlan,
          rollbackSteps: plugin.uninstallPlan,
          riskNotes: [],
          questions: [],
        },
        projectRoot,
        globalClaudeDir
      );

      if (result.success) {
        plugin.installed = true;
        plugin.updatedAt = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(plugin, null, 2));
      }
      return res.json({ ...result, plugin });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return res
          .status(404)
          .json({ error: "NOT_FOUND", message: "Plugin not found" });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: "INSTALL_ERROR", message });
    }
  });

  // POST /api/assistant/plugins/:id/uninstall
  router.post(
    "/plugins/:id/uninstall",
    async (req: Request, res: Response) => {
      try {
        const filePath = path.join(pluginsDir, `${req.params.id}.json`);
        const data = await fs.readFile(filePath, "utf-8");
        const plugin: PluginDefinition = JSON.parse(data);

        // Rollback: delete created artifacts
        const result = await rollbackChoice(plugin.artifacts, plugin.scope, projectRoot, globalClaudeDir);

        if (result.success) {
          plugin.installed = false;
          plugin.updatedAt = new Date().toISOString();
          await fs.writeFile(filePath, JSON.stringify(plugin, null, 2));
        }
        return res.json({ ...result, plugin });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          return res
            .status(404)
            .json({ error: "NOT_FOUND", message: "Plugin not found" });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(500).json({ error: "UNINSTALL_ERROR", message });
      }
    }
  );

  // DELETE /api/assistant/plugins/:id
  router.delete("/plugins/:id", async (req: Request, res: Response) => {
    try {
      const filePath = path.join(pluginsDir, `${req.params.id}.json`);
      await fs.unlink(filePath);
      return res.json({ success: true });
    } catch {
      return res
        .status(404)
        .json({ error: "NOT_FOUND", message: "Plugin not found" });
    }
  });

  // GET /api/assistant/plugins/:id/export
  router.get("/plugins/:id/export", async (req: Request, res: Response) => {
    try {
      const filePath = path.join(pluginsDir, `${req.params.id}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      const plugin = JSON.parse(data);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${plugin.name || req.params.id}.json"`
      );
      res.setHeader("Content-Type", "application/json");
      return res.send(data);
    } catch {
      return res
        .status(404)
        .json({ error: "NOT_FOUND", message: "Plugin not found" });
    }
  });

  // POST /api/assistant/plugins/import
  router.post("/plugins/import", async (req: Request, res: Response) => {
    try {
      const pluginData = req.body as PluginDefinition;
      if (!pluginData.pluginId || !pluginData.name || !pluginData.artifacts) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message:
            "Invalid plugin format: pluginId, name, artifacts required",
        });
      }
      // Assign new ID to avoid conflicts
      pluginData.pluginId = `plugin_${randomUUID()}`;
      pluginData.installed = false;
      pluginData.updatedAt = new Date().toISOString();
      await fs.mkdir(pluginsDir, { recursive: true });
      await fs.writeFile(
        path.join(pluginsDir, `${pluginData.pluginId}.json`),
        JSON.stringify(pluginData, null, 2)
      );
      return res.status(201).json(pluginData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: "IMPORT_ERROR", message });
    }
  });

  // ===== Golden Set Evaluation =====
  // GET /api/assistant/golden-set
  router.get("/golden-set", async (_req: Request, res: Response) => {
    try {
      const goldenSet = loadGoldenSet();
      return res.json({ cases: goldenSet, total: goldenSet.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load golden set";
      return res.status(500).json({ error: "LOAD_ERROR", message });
    }
  });

  // POST /api/assistant/evaluate
  router.post("/evaluate", async (req: Request, res: Response) => {
    try {
      const { caseIds } = req.body as { caseIds?: string[] };
      const goldenSet = loadGoldenSet();
      const casesToRun = caseIds
        ? goldenSet.filter((c) => caseIds.includes(c.id))
        : goldenSet;

      if (casesToRun.length === 0) {
        return res.status(400).json({ error: "NO_CASES", message: "No cases to evaluate" });
      }

      // Mock mode: return synthetic results
      if (req.query.mock === "true") {
        const report = createMockEvalReport(casesToRun);
        return res.json(report);
      }

      // Real evaluation (sequential to avoid rate limits)
      const report = await runGoldenEval(casesToRun, projectRoot);
      return res.json(report);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Evaluation failed";
      return res.status(500).json({ error: "EVAL_ERROR", message });
    }
  });

  // ===== Marketplace / Library Endpoints =====
  // NOTE: /plugins/search is registered above (before /:id routes)

  // POST /api/assistant/plugins/bundle/export
  router.post("/plugins/bundle/export", async (req: Request, res: Response) => {
    try {
      const { pluginIds } = req.body as { pluginIds: string[] };
      if (!pluginIds || pluginIds.length === 0) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "pluginIds required" });
      }
      const bundle: PluginDefinition[] = [];
      for (const id of pluginIds) {
        try {
          const data = await fs.readFile(path.join(pluginsDir, `${id}.json`), "utf-8");
          bundle.push(JSON.parse(data));
        } catch {
          /* skip missing */
        }
      }
      res.setHeader("Content-Disposition", `attachment; filename="plugin-bundle.json"`);
      res.setHeader("Content-Type", "application/json");
      return res.json({ version: "1.0", exportedAt: new Date().toISOString(), plugins: bundle });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      return res.status(500).json({ error: "EXPORT_ERROR", message });
    }
  });

  // POST /api/assistant/plugins/bundle/import
  router.post("/plugins/bundle/import", async (req: Request, res: Response) => {
    try {
      const { plugins: bundledPlugins } = req.body as { plugins: PluginDefinition[] };
      if (!bundledPlugins || !Array.isArray(bundledPlugins)) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "plugins array required" });
      }
      await fs.mkdir(pluginsDir, { recursive: true });
      const imported: PluginDefinition[] = [];
      for (const p of bundledPlugins) {
        if (!p.name || !p.artifacts) continue;
        p.pluginId = `plugin_${randomUUID()}`;
        p.installed = false;
        p.updatedAt = new Date().toISOString();
        await fs.writeFile(
          path.join(pluginsDir, `${p.pluginId}.json`),
          JSON.stringify(p, null, 2)
        );
        imported.push(p);
      }
      return res.status(201).json({ imported: imported.length, plugins: imported });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      return res.status(500).json({ error: "IMPORT_ERROR", message });
    }
  });

  return router;
}

// === Golden Set Helpers ===

function loadGoldenSet(): GoldenCase[] {
  // Use require for JSON (synchronous, cached)
  const goldenSetPath = path.join(__dirname, "golden-set.json");
  try {
    const data = require(goldenSetPath);
    return data as GoldenCase[];
  } catch {
    return [];
  }
}

function createMockEvalReport(cases: GoldenCase[]): GoldenEvalReport {
  const reportId = `eval_${randomUUID()}`;
  const startTime = Date.now();
  const results: GoldenEvalResult[] = cases.map((c) => ({
    caseId: c.id,
    prompt: c.prompt,
    pass: true,
    matchedArtifacts: c.expectedArtifacts.length,
    expectedArtifacts: c.expectedArtifacts.length,
    details: [`Mock: all ${c.expectedArtifacts.length} artifact(s) matched`],
    durationMs: Math.floor(Math.random() * 500) + 100,
  }));
  const passed = results.filter((r) => r.pass).length;
  return {
    reportId,
    runAt: new Date().toISOString(),
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    passRate: cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0,
    results,
    durationMs: Date.now() - startTime,
  };
}

async function runGoldenEval(
  cases: GoldenCase[],
  projectRoot: string
): Promise<GoldenEvalReport> {
  const reportId = `eval_${randomUUID()}`;
  const startTime = Date.now();
  const results: GoldenEvalResult[] = [];

  for (const c of cases) {
    const caseStart = Date.now();
    try {
      const plan = await generateProposal(c.prompt, "project", projectRoot);
      const choice = plan.choices[0];
      if (!choice) {
        results.push({
          caseId: c.id,
          prompt: c.prompt,
          pass: false,
          matchedArtifacts: 0,
          expectedArtifacts: c.expectedArtifacts.length,
          details: ["No choice generated"],
          durationMs: Date.now() - caseStart,
        });
        continue;
      }

      let matched = 0;
      const details: string[] = [];
      for (const expected of c.expectedArtifacts) {
        const regex = new RegExp(expected.namePattern, "i");
        const found = choice.artifacts.some(
          (a) => a.kind === expected.kind && regex.test(a.name)
        );
        if (found) {
          matched++;
          details.push(`OK: ${expected.kind}/${expected.namePattern}`);
        } else {
          details.push(`MISS: ${expected.kind}/${expected.namePattern} — got: ${choice.artifacts.map((a) => a.kind + "/" + a.name).join(", ") || "none"}`);
        }
      }

      results.push({
        caseId: c.id,
        prompt: c.prompt,
        pass: matched === c.expectedArtifacts.length,
        matchedArtifacts: matched,
        expectedArtifacts: c.expectedArtifacts.length,
        details,
        durationMs: Date.now() - caseStart,
      });
    } catch (err) {
      results.push({
        caseId: c.id,
        prompt: c.prompt,
        pass: false,
        matchedArtifacts: 0,
        expectedArtifacts: c.expectedArtifacts.length,
        details: [`Error: ${err instanceof Error ? err.message : "unknown"}`],
        durationMs: Date.now() - caseStart,
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    reportId,
    runAt: new Date().toISOString(),
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    passRate: cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0,
    results,
    durationMs: Date.now() - startTime,
  };
}

// === Mock Proposer (for E2E tests) ===
function createMockProposal(
  prompt: string,
  scope: string
): ProposalPlanSet {
  const planSetId = `plan_${randomUUID()}`;
  return {
    planSetId,
    createdAt: new Date().toISOString(),
    userPrompt: prompt,
    choices: [
      {
        choiceId: `choice_${randomUUID()}`,
        title: "Recommended Setup",
        summary: `Auto-generated configuration based on: "${prompt}"`,
        scope: scope as "global" | "project" | "local",
        artifacts: [
          {
            kind: "command",
            name: "assistant-generated",
            targetPathHint: ".claude/commands/assistant-generated.md",
            content: `# Assistant Generated Command\n\nGenerated from prompt: ${prompt}\n\nThis command was created by the Assistant.`,
          },
        ],
        applySteps: [
          "Create command file at .claude/commands/assistant-generated.md",
        ],
        rollbackSteps: ["Delete .claude/commands/assistant-generated.md"],
        riskNotes: ["This will create a new command file"],
        questions: [],
      },
    ],
  };
}

// === Real LLM Proposal Generation ===
async function generateProposal(
  prompt: string,
  scope: string,
  _projectRoot: string,
  repoProfile?: Record<string, unknown>
): Promise<ProposalPlanSet> {
  const { LLMClient } = await import("../../mediation/llm-client");
  const { loadGlobalConfig, getApiKey } = await import(
    "../../config/global-config"
  );

  const config = loadGlobalConfig();
  const provider = (config.defaultProvider || "openai") as "openai" | "anthropic";
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `API key not configured for provider: ${provider}. Please set it in Settings.`
    );
  }

  const model =
    config.defaultModels?.[provider] ||
    (provider === "openai" ? "gpt-4o-mini" : "claude-3-haiku-20240307");

  const client = new LLMClient({
    provider,
    model,
    apiKey,
    temperature: 0.7,
    maxTokens: 4096,
  });

  const systemPrompt = buildSystemPrompt(scope);

  // Inject repo profile context if available
  let userContent = prompt;
  if (repoProfile) {
    userContent = `[Project Context]\n${JSON.stringify(repoProfile, null, 2)}\n\n[User Request]\n${prompt}`;
  }

  const response = await client.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  // Extract JSON from response
  const planSet = parseProposalResponse(response.content, prompt);
  return planSet;
}

function buildSystemPrompt(scope: string): string {
  return `You are a Claude Code configuration assistant. Given a user's request, generate a structured plan with artifacts.

IMPORTANT: You must respond with ONLY a valid JSON object (no markdown, no explanation). The JSON must follow this exact schema:

{
  "choices": [
    {
      "title": "Short title for this plan",
      "summary": "Brief description of what this plan does",
      "scope": "${scope}",
      "artifacts": [
        {
          "kind": "command|hook|agent|skill|script|claudeMdPatch|settingsJsonPatch",
          "name": "artifact-name",
          "targetPathHint": ".claude/commands/artifact-name.md",
          "content": "Full file content here"
        }
      ],
      "applySteps": ["Step 1: ...", "Step 2: ..."],
      "rollbackSteps": ["Step 1: ..."],
      "riskNotes": ["Note about potential risks"],
      "questions": []
    }
  ]
}

Artifact kinds:
- "command": Creates .claude/commands/{name}.md
- "hook": Creates hook configuration in settings
- "agent": Creates .claude/agents/{name}.md
- "skill": Creates .claude/skills/{name}.md
- "script": Creates .claude/hooks/{name}.sh (executable)
- "claudeMdPatch": Patch to append to .claude/CLAUDE.md
- "settingsJsonPatch": JSON patch for .claude/settings.json

Generate 1-2 choices (plans). Each choice should be a complete, self-contained solution.
Scope "${scope}" means files go to ${scope === "global" ? "~/.claude/" : ".claude/ (project root)"}.`;
}

function parseProposalResponse(
  rawResponse: string,
  originalPrompt: string
): ProposalPlanSet {
  const planSetId = `plan_${randomUUID()}`;

  // Try to extract JSON from various formats
  let jsonStr = rawResponse;

  // Try markdown code block
  const codeBlockMatch = rawResponse.match(
    /```(?:json)?\s*\n?([\s\S]*?)\n?```/
  );
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM response does not contain valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.choices || !Array.isArray(parsed.choices)) {
    throw new Error('LLM response missing "choices" array');
  }

  // Normalize and validate
  const choices: ProposalChoice[] = parsed.choices.map(
    (c: Record<string, unknown>, i: number) => ({
      choiceId: `choice_${randomUUID()}`,
      title: (c.title as string) || `Plan ${String.fromCharCode(65 + i)}`,
      summary: (c.summary as string) || "",
      scope: (c.scope as string) || "project",
      artifacts: (
        (c.artifacts as Array<Record<string, unknown>>) || []
      ).map((a: Record<string, unknown>) => ({
        kind: (a.kind as string) || "command",
        name: (a.name as string) || "unnamed",
        targetPathHint: (a.targetPathHint as string) || "",
        content: a.content as string | undefined,
        patch: a.patch as Record<string, unknown> | undefined,
        dependsOn: (a.dependsOn as string[]) || [],
      })),
      applySteps: (c.applySteps as string[]) || [],
      rollbackSteps: (c.rollbackSteps as string[]) || [],
      riskNotes: (c.riskNotes as string[]) || [],
      questions: (c.questions as string[]) || [],
    })
  );

  return {
    planSetId,
    createdAt: new Date().toISOString(),
    userPrompt: originalPrompt,
    choices,
  };
}

// === Plan Validation (dry-run safety checks) ===

const VALID_KINDS = new Set([
  "command", "agent", "skill", "script", "hook",
  "claudeMdPatch", "settingsJsonPatch",
]);

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  command: [".md"],
  agent: [".md"],
  skill: [".md"],
  script: [".sh"],
  hook: [".sh"],
};

function validateChoice(choice: ProposalChoice): string[] {
  const errors: string[] = [];

  if (!choice.artifacts || choice.artifacts.length === 0) {
    return errors; // empty plan is valid (no-op)
  }

  // Validate scope
  if (choice.scope && !["global", "project", "local"].includes(choice.scope)) {
    errors.push(`Invalid scope: "${choice.scope}". Must be global, project, or local.`);
  }

  const artifactNames = new Set<string>();

  for (let i = 0; i < choice.artifacts.length; i++) {
    const a = choice.artifacts[i];
    const prefix = `artifacts[${i}] (${a.name || "unnamed"})`;

    // 1) Kind validation
    if (!VALID_KINDS.has(a.kind)) {
      errors.push(`${prefix}: invalid kind "${a.kind}"`);
      continue;
    }

    // Skip path checks for patch-type artifacts
    if (a.kind === "claudeMdPatch" || a.kind === "settingsJsonPatch") {
      artifactNames.add(a.name);
      continue;
    }

    // 2) Name validation - path traversal
    if (!a.name) {
      errors.push(`${prefix}: name is required`);
      continue;
    }
    if (/[/\\]/.test(a.name)) {
      errors.push(`${prefix}: name must not contain path separators (/ or \\)`);
    }
    if (a.name.includes("..")) {
      errors.push(`${prefix}: name must not contain ".."`);
    }
    if (path.isAbsolute(a.name)) {
      errors.push(`${prefix}: name must not be an absolute path`);
    }

    // 3) Extension validation
    const allowedExts = ALLOWED_EXTENSIONS[a.kind];
    if (allowedExts) {
      const ext = a.kind === "script" ? ".sh" : ".md";
      // The resolved file will use this extension; check name doesn't smuggle a different one
      if (a.name.includes(".") && !allowedExts.some(e => a.name.endsWith(e.replace(".", "")))) {
        // Name has a dot but doesn't end with the allowed ext-stem: flag it
        const nameExt = path.extname(a.name);
        if (nameExt && !allowedExts.includes(nameExt)) {
          errors.push(`${prefix}: disallowed extension "${nameExt}" for kind "${a.kind}". Allowed: ${allowedExts.join(", ")}`);
        }
      }
      // Also reject names that literally end with dangerous extensions
      const dangerousExts = [".exe", ".bat", ".cmd", ".com", ".ps1", ".msi", ".dll", ".so", ".dylib"];
      for (const dext of dangerousExts) {
        if (a.name.toLowerCase().endsWith(dext)) {
          errors.push(`${prefix}: dangerous extension "${dext}" is not allowed`);
        }
      }
    }

    // 4) targetPathHint scope consistency
    if (a.targetPathHint) {
      if (a.targetPathHint.includes("..")) {
        errors.push(`${prefix}: targetPathHint must not contain ".."`);
      }
      if (path.isAbsolute(a.targetPathHint)) {
        errors.push(`${prefix}: targetPathHint must not be an absolute path`);
      }
    }

    artifactNames.add(a.name);
  }

  // 5) dependsOn validation - circular references and missing references
  const depGraph = new Map<string, string[]>();
  for (const a of choice.artifacts) {
    if (a.dependsOn && a.dependsOn.length > 0) {
      depGraph.set(a.name, a.dependsOn);
      // Check for missing references
      for (const dep of a.dependsOn) {
        if (!artifactNames.has(dep)) {
          errors.push(`artifacts "${a.name}": dependsOn references non-existent artifact "${dep}"`);
        }
      }
    }
  }
  // Check for cycles using DFS
  const cycleError = detectCycle(depGraph);
  if (cycleError) {
    errors.push(cycleError);
  }

  return errors;
}

function detectCycle(graph: Map<string, string[]>): string | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): string | null {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      return `Circular dependency detected: ${cycle.join(" -> ")}`;
    }
    if (visited.has(node)) return null;

    visited.add(node);
    inStack.add(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      const err = dfs(dep, [...path, node]);
      if (err) return err;
    }

    inStack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    const err = dfs(node, []);
    if (err) return err;
  }

  return null;
}

// === Apply Engine ===
async function applyChoice(
  choice: ProposalChoice,
  projectRoot: string,
  globalClaudeDir?: string
): Promise<ApplyResult> {
  const result: ApplyResult = {
    success: true,
    created: [],
    updated: [],
    deleted: [],
    errors: [],
  };
  const appliedFiles: string[] = [];

  for (const artifact of choice.artifacts) {
    try {
      const filePath = resolveArtifactPath(
        artifact,
        choice.scope,
        projectRoot,
        globalClaudeDir
      );

      if (artifact.kind === "settingsJsonPatch" && artifact.patch) {
        // JSON merge patch for settings
        await applyJsonPatch(filePath, artifact.patch);
        result.updated.push(filePath);
      } else if (artifact.kind === "claudeMdPatch" && artifact.content) {
        // Append to CLAUDE.md
        await appendToFile(filePath, artifact.content);
        result.updated.push(filePath);
      } else if (artifact.content) {
        // Create/overwrite file
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        const exists = await fileExists(filePath);
        await fs.writeFile(filePath, artifact.content, "utf-8");
        if (artifact.kind === "script") {
          await fs.chmod(filePath, 0o755);
        }
        if (exists) {
          result.updated.push(filePath);
        } else {
          result.created.push(filePath);
        }
      }
      appliedFiles.push(filePath);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to apply ${artifact.name}: ${message}`);
      result.success = false;
      // Rollback already applied files
      for (const applied of appliedFiles) {
        try {
          await fs.unlink(applied);
        } catch {
          /* ignore */
        }
      }
      result.deleted = appliedFiles;
      result.created = [];
      result.updated = [];
      break;
    }
  }

  return result;
}

async function rollbackChoice(
  artifacts: ProposalArtifact[],
  scope: string,
  projectRoot: string,
  globalClaudeDir?: string
): Promise<ApplyResult> {
  const result: ApplyResult = {
    success: true,
    created: [],
    updated: [],
    deleted: [],
    errors: [],
  };

  for (const artifact of artifacts) {
    try {
      // Only delete file-based artifacts (not patches)
      if (
        artifact.kind !== "settingsJsonPatch" &&
        artifact.kind !== "claudeMdPatch"
      ) {
        const filePath = resolveArtifactPath(artifact, scope, projectRoot, globalClaudeDir);
        if (await fileExists(filePath)) {
          await fs.unlink(filePath);
          result.deleted.push(filePath);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to rollback ${artifact.name}: ${message}`);
      result.success = false;
    }
  }

  return result;
}

function resolveArtifactPath(
  artifact: ProposalArtifact,
  scope: string,
  projectRoot: string,
  globalClaudeDir?: string
): string {
  const baseDir =
    scope === "global"
      ? (globalClaudeDir || path.join(process.env.HOME || "~", ".claude"))
      : path.join(projectRoot, ".claude");

  const kindDirMap: Record<string, string> = {
    command: "commands",
    agent: "agents",
    skill: "skills",
    script: "hooks",
    hook: "hooks",
  };

  if (artifact.kind === "claudeMdPatch") {
    return path.join(baseDir, "CLAUDE.md");
  }
  if (artifact.kind === "settingsJsonPatch") {
    return path.join(baseDir, "settings.json");
  }

  const subDir = kindDirMap[artifact.kind] || artifact.kind;
  const ext = artifact.kind === "script" ? ".sh" : ".md";
  // Validate artifact name to prevent path traversal
  if (!artifact.name || /[/\\]/.test(artifact.name) || artifact.name.includes('..')) {
    throw new Error(`Invalid artifact name: ${artifact.name}`);
  }
  return path.join(baseDir, subDir, `${artifact.name}${ext}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function applyJsonPatch(
  filePath: string,
  patch: Record<string, unknown>
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const data = await fs.readFile(filePath, "utf-8");
    existing = JSON.parse(data);
  } catch {
    /* file doesn't exist, start fresh */
  }

  const merged = { ...existing, ...patch };
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), "utf-8");
}

async function appendToFile(
  filePath: string,
  content: string
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    /* file doesn't exist */
  }
  await fs.writeFile(filePath, existing + "\n" + content, "utf-8");
}
