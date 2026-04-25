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
import { readFileSync } from "fs";
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
import { OPENAI_MODELS, ANTHROPIC_MODELS } from "../../models/repl/model-registry";

// === AI Generate (Batch 3) ===
// New defaults — see spec/37_AI_GENERATE.md §3 "Default Models".
// Replaces the previous basic-tier defaults (gpt-4o-mini, claude-3-haiku-20240307)
// based on user feedback that AI Generate output quality was insufficient.
const AI_GENERATE_DEFAULT_MODELS: Record<"openai" | "anthropic", string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
};

/**
 * Returns the AI Generate fallback default model for a provider.
 * Used when neither the request body nor the user's `defaultModels` config
 * supplies a model.
 *
 * Spec: spec/37_AI_GENERATE.md §3 "Default Models"
 */
export function resolveDefaultModel(provider: "openai" | "anthropic"): string {
  return AI_GENERATE_DEFAULT_MODELS[provider];
}

/**
 * Validate an optional {provider, model} override on POST /api/assistant/propose.
 *
 * Behavior:
 *   - Both undefined/null → returns the new defaults (provider="openai", model="gpt-4o").
 *   - Both supplied      → registry-validated; returns ok with the pair, or error.
 *   - Provider only      → registry-validated provider, model = default for that provider.
 *   - Model only         → rejected (ambiguous; cannot infer provider).
 *
 * Spec: spec/37_AI_GENERATE.md §5.3 "POST Body Extension"
 */
export function validateModelOverride(
  rawProvider: unknown,
  rawModel: unknown
):
  | { ok: true; provider: "openai" | "anthropic"; model: string }
  | { ok: false; error: string } {
  const providerProvided = rawProvider !== undefined && rawProvider !== null && rawProvider !== "";
  const modelProvided = rawModel !== undefined && rawModel !== null && rawModel !== "";

  // Case 1: nothing supplied → defaults.
  if (!providerProvided && !modelProvided) {
    return { ok: true, provider: "openai", model: resolveDefaultModel("openai") };
  }

  // Case 2: model only → reject (provider is required to disambiguate).
  if (!providerProvided && modelProvided) {
    return { ok: false, error: "model supplied without provider; both fields are required" };
  }

  // Provider must be openai or anthropic.
  if (rawProvider !== "openai" && rawProvider !== "anthropic") {
    return { ok: false, error: `invalid provider "${String(rawProvider)}"; expected "openai" or "anthropic"` };
  }
  const provider = rawProvider as "openai" | "anthropic";

  // Case 3: provider only → use default model for provider.
  if (!modelProvided) {
    return { ok: true, provider, model: resolveDefaultModel(provider) };
  }

  // Case 4: both supplied → validate model exists in that provider's registry.
  if (typeof rawModel !== "string") {
    return { ok: false, error: `invalid model: not a string` };
  }
  const registry = provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;
  if (!registry.some((m) => m.id === rawModel)) {
    return { ok: false, error: `invalid model "${rawModel}" for provider "${provider}"` };
  }
  return { ok: true, provider, model: rawModel };
}

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
      const { prompt, scope, provider, model } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res
          .status(400)
          .json({ error: "VALIDATION_ERROR", message: "prompt is required" });
      }
      const effectiveScope = scope || "project";

      // Batch 3: validate optional {provider, model} override.
      // Spec: spec/37_AI_GENERATE.md §5.3
      const overrideResult = validateModelOverride(provider, model);
      if (!overrideResult.ok) {
        return res
          .status(400)
          .json({ error: "VALIDATION_ERROR", message: overrideResult.error });
      }

      // Mock mode for E2E tests
      if (req.query.mock === "true") {
        const mockPlan = createMockProposal(prompt, effectiveScope);
        // Echo the resolved override in meta for debugging / E2E assertions.
        return res.json({
          ...mockPlan,
          meta: {
            selectedProvider: overrideResult.provider,
            selectedModel: overrideResult.model,
          },
        });
      }

      // Real LLM call (inject repoProfile if available, plus override if supplied).
      const overrideForGenerate =
        provider !== undefined || model !== undefined
          ? { provider: overrideResult.provider, model: overrideResult.model }
          : undefined;
      const plan = await generateProposal(
        prompt,
        effectiveScope,
        projectRoot,
        req.body.repoProfile,
        overrideForGenerate
      );
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

  // GET /api/assistant/plugins/search?q=&tags=&category=&author=  (MUST be before /:id)
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
      const author = (req.query.author as string) || "";

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
      if (author) {
        plugins = plugins.filter((p) => p.author === author);
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
  const goldenSetPath = path.join(__dirname, "golden-set.json");
  try {
    const raw = readFileSync(goldenSetPath, 'utf-8');
    return JSON.parse(raw) as GoldenCase[];
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
  repoProfile?: Record<string, unknown>,
  override?: { provider: "openai" | "anthropic"; model: string }
): Promise<ProposalPlanSet> {
  const { LLMClient } = await import("../../mediation/llm-client");
  const { loadGlobalConfig, getApiKey } = await import(
    "../../config/global-config"
  );

  const config = loadGlobalConfig();

  // Batch 3 resolve order:
  //   1. Explicit override from request body (already validated against registry).
  //   2. config.defaultProvider / config.defaultModels (Settings page defaults).
  //   3. AI Generate fallback defaults (gpt-4o / claude-sonnet-4-20250514).
  // Spec: spec/37_AI_GENERATE.md §3.2
  const provider: "openai" | "anthropic" = override?.provider
    ?? ((config.defaultProvider || "openai") as "openai" | "anthropic");

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `API key not configured for provider: ${provider}. Please set it in Settings.`
    );
  }

  const model = override?.model
    ?? config.defaultModels?.[provider]
    ?? resolveDefaultModel(provider);

  // Per-provider maxTokens (Fix A3: avoid mid-response truncation on OpenAI)
  // - OpenAI: 16384 (gpt-4o family supports up to 16384 output tokens)
  // - Anthropic: 8192 (claude 3.x default; safe across models)
  const maxTokens = provider === "openai" ? 16384 : 8192;

  const client = new LLMClient({
    provider,
    model,
    apiKey,
    temperature: 0.7,
    maxTokens,
  });

  const systemPrompt = buildSystemPrompt(scope);

  // Inject repo profile context if available
  let userContent = prompt;
  if (repoProfile) {
    userContent = `[Project Context]\n${JSON.stringify(repoProfile, null, 2)}\n\n[User Request]\n${prompt}`;
  }

  // Fix A4: Structured output for OpenAI (response_format: json_schema strict)
  // Forces the model to emit JSON conforming to PROPOSAL_RESPONSE_JSON_SCHEMA,
  // eliminating most parse failures at the source.
  // Anthropic does not support response_format; we keep the prompt-based JSON path.
  const chatOptions = provider === "openai"
    ? { responseFormat: buildOpenAIResponseFormat() }
    : undefined;

  const response = await client.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], chatOptions);

  // Extract JSON from response
  const planSet = parseProposalResponse(response.content, prompt);
  // Batch 3: surface the resolved provider/model in meta so the UI / E2E tests
  // can confirm the override took effect.
  return {
    ...planSet,
    meta: {
      selectedProvider: provider,
      selectedModel: model,
    },
  } as ProposalPlanSet & { meta: { selectedProvider: string; selectedModel: string } };
}

/**
 * Build the system prompt for AI Generate.
 *
 * Batch 3: Expanded from ~50 lines to a 6-section structure (Role / Output Format /
 * Artifact Kinds / Quality Guidelines / Examples / Constraints) to address user
 * feedback that generated skills/agents had low quality.
 *
 * Spec: spec/37_AI_GENERATE.md §4 "System Prompt Structure"
 */
export function buildSystemPrompt(scope: string): string {
  const baseDir =
    scope === "global"
      ? "~/.claude/"
      : ".claude/ (project root)";

  return `### Role

You are an expert Claude Code configuration author. Your job is to read a user's
natural-language request and produce production-quality configuration artifacts
(skills, agents, slash commands, hooks, scripts, CLAUDE.md patches, settings.json
patches) that another developer can install with one click and immediately use.

You write artifacts the same way a senior Claude Code user would: terse where
terseness wins, explicit where ambiguity would burn the user, always grounded
in real Claude Code conventions (never invented APIs, never imaginary CLI flags).

### Output Format

Respond with **ONLY** a single valid JSON object — no markdown fences, no prose,
no explanation outside the JSON. The schema is exactly:

{
  "choices": [
    {
      "title": "Short, action-oriented title (~40 chars)",
      "summary": "1–2 sentence description of what this plan delivers and why",
      "scope": "${scope}",
      "artifacts": [
        {
          "kind": "command|hook|agent|skill|script|claudeMdPatch|settingsJsonPatch",
          "name": "kebab-case-artifact-name",
          "targetPathHint": ".claude/commands/kebab-case-artifact-name.md",
          "content": "Full UTF-8 file content (or null for patch-only artifacts)",
          "patch": null,
          "dependsOn": null
        }
      ],
      "applySteps": ["Human-readable install step 1", "..."],
      "rollbackSteps": ["Human-readable uninstall step 1", "..."],
      "riskNotes": ["What could go wrong if this is misapplied"],
      "questions": []
    }
  ]
}

OpenAI strict-mode requirements (apply ALWAYS, even on Anthropic):
- Every artifact MUST include all six keys: kind, name, targetPathHint, content,
  patch, dependsOn. Use null for fields that do not apply (do not omit keys).
- For settingsJsonPatch, "patch" is a STRING containing JSON (e.g.
  "{\\"hooks\\":{\\"UserPromptSubmit\\":[{\\"command\\":\\"echo hi\\"}]}}").
  The server JSON.parses it on receipt. Do not nest a raw object.
- For claudeMdPatch, put the markdown to append in "content"; "patch" is null.
- For all other kinds, "content" is the raw file body and "patch" is null.

Generate **1 or 2 choices** (plans). When you give 2, they should represent a
real trade-off (e.g. minimal vs. comprehensive), not near-duplicates.

Files target ${baseDir} (scope = "${scope}").

### Artifact Kinds

- **skill** → .claude/skills/{name}.md
  Front-matter (YAML) preferred. Section structure: purpose, when-to-use,
  inputs, output format, examples. Skills are loaded by Claude on-demand based
  on trigger phrases the user describes, so the description field MUST be
  specific and discriminating ("invoked when the user asks to convert a CSV to
  parquet" — not "data utility skill").

- **agent** → .claude/agents/{name}.md
  Define role, capabilities, allowed tools, and a short SOP. Agents are sub-
  process orchestrators; keep them focused on one concern (rule-checker,
  implementer, qa, reporter, etc.). Use existing agent names from the project
  if they fit; do not invent overlapping ones.

- **command** → .claude/commands/{name}.md
  Markdown body becomes the slash command prompt. Start with a one-line
  summary, then list usage, arguments, and the literal instructions Claude
  should follow. Keep under ~80 lines unless the workflow is genuinely complex.

- **hook** → entry inside settings.json under hooks.{Event}[]
  Ship as a settingsJsonPatch artifact whose "patch" string contains the
  hooks object. Reference any companion shell script via
  \`hooks/{script-name}.sh\`.

- **script** → .claude/hooks/{name}.sh (chmod +x)
  Bash-only. Begin with \`#!/usr/bin/env bash\` and \`set -euo pipefail\`.
  No interactive prompts; no curl into untrusted URLs.

- **claudeMdPatch** → appended to .claude/CLAUDE.md
  Use h2/h3 headings; do NOT redefine the entire file. Patches are plain
  Markdown text that will be concatenated.

- **settingsJsonPatch** → shallow-merged into .claude/settings.json
  Only emit the keys you intend to change. The server merges at the top level.

### Quality Guidelines

1. **Respect project conventions.** If the user supplies a [Project Context]
   block, prefer the package manager, test framework, lint config, and naming
   style described there. Do not introduce a new tool just because it is
   trendy.
2. **Be concrete.** Include at least one fully-formed example invocation,
   command line, or input/output sample inside the artifact body. Avoid
   placeholder phrases like "// implementation here" or "TODO".
3. **Do not invent flags or APIs.** Do not hallucinate Claude Code SDK
   methods, slash command flags, or hook event names. If unsure, omit the
   feature rather than guess. Never make up CLI arguments.
4. **No secrets.** Do not embed API keys, tokens, OAuth secrets, or
   credentials in any artifact content. Reference environment variables
   instead (e.g. \`\${OPENAI_API_KEY}\`).
5. **Avoid name collisions.** Pick distinctive kebab-case names. Prefer
   "git-pr-summary-bot" over "helper" or "agent".
6. **Make it idempotent.** Apply steps should be safe to re-run; rollback
   steps should fully undo the install.
7. **Match scope.** All targetPathHint values must start with
   ${scope === "global" ? "\"~/.claude/\"" : "\".claude/\""}; never use absolute system paths.
8. **Right-size the plan.** Smaller, focused artifacts beat one mega-file.
   Split a workflow across two artifacts if their concerns are distinct.

### Examples

Example A — User Prompt:
"Add a slash command /lint that runs eslint and pretty-prints the results."

Example A — Output JSON (abbreviated):
{
  "choices": [
    {
      "title": "Slash command: /lint with eslint",
      "summary": "Adds a /lint slash command that runs ESLint via the project's package manager and surfaces the top issues.",
      "scope": "${scope}",
      "artifacts": [
        {
          "kind": "command",
          "name": "lint",
          "targetPathHint": ".claude/commands/lint.md",
          "content": "# /lint — Run ESLint\\n\\nRun the project's ESLint and summarize the top 10 issues.\\n\\n## Steps\\n1. Detect the package manager (pnpm/npm/yarn).\\n2. Run \\\`<pm> run lint\\\`.\\n3. Parse the output and list file:line — rule — message.\\n4. Suggest the single highest-impact fix.",
          "patch": null,
          "dependsOn": null
        }
      ],
      "applySteps": ["Create .claude/commands/lint.md"],
      "rollbackSteps": ["Delete .claude/commands/lint.md"],
      "riskNotes": ["Assumes a 'lint' npm script exists; otherwise the command will explain how to add one."],
      "questions": []
    }
  ]
}

Example B — User Prompt:
"Create a skill that triggers when the user asks to format a CSV into a markdown table."

Example B — Output JSON (abbreviated):
{
  "choices": [
    {
      "title": "Skill: csv-to-markdown-table",
      "summary": "Skill invoked when the user asks to convert CSV input into a Markdown table, preserving header alignment.",
      "scope": "${scope}",
      "artifacts": [
        {
          "kind": "skill",
          "name": "csv-to-markdown-table",
          "targetPathHint": ".claude/skills/csv-to-markdown-table.md",
          "content": "---\\nname: csv-to-markdown-table\\ndescription: Use when the user provides CSV data (raw text or file path) and asks to format it as a Markdown table.\\n---\\n\\n## Steps\\n1. Detect delimiter (',' or '\\\\t').\\n2. Treat the first row as header.\\n3. Compute column widths and emit \\\`| col | col |\\\` with alignment row.\\n4. Show a 5-row preview if input is long.\\n\\n## Example Input\\nname,age\\nAlice,30\\nBob,25\\n\\n## Example Output\\n| name  | age |\\n| ----- | --- |\\n| Alice | 30  |\\n| Bob   | 25  |",
          "patch": null,
          "dependsOn": null
        }
      ],
      "applySteps": ["Create .claude/skills/csv-to-markdown-table.md"],
      "rollbackSteps": ["Delete .claude/skills/csv-to-markdown-table.md"],
      "riskNotes": ["Skill assumes well-formed CSV; malformed input will produce a misaligned table."],
      "questions": []
    }
  ]
}

### Constraints

- Never invent or fabricate Claude Code APIs, slash command flags, hook event
  names, or SDK methods. If a capability is uncertain, leave it out.
- Do not use absolute paths or paths containing "..". All targetPathHint
  values must be relative to ${baseDir}.
- Do not embed secrets, credentials, API keys, or OAuth tokens in any
  artifact content. Reference environment variables instead.
- Do not produce file extensions outside the allowed set per kind:
  command/agent/skill → .md, script/hook → .sh.
- Do not generate dangerous extensions: .exe, .bat, .cmd, .com, .ps1, .msi,
  .dll, .so, .dylib are rejected by the validator.
- Output must be a single JSON object that conforms to the schema above. No
  trailing prose, no leading markdown fence, no commentary.
`;
}

/**
 * Fix A5: log the full LLM response (server-side only) on parse failure
 * so we can diagnose the underlying cause without leaking large payloads to clients.
 * Uses console.error because the project does not currently have a structured logger
 * imported in this module (other modules use console.* directly).
 */
function logFullLlmResponseOnFailure(stage: string, fullResponse: string): void {
  // Print on a separate line to keep stdout/stderr greppable.
  // eslint-disable-next-line no-console
  console.error(
    `[assistant.parseProposalResponse] LLM_PARSE_FAILURE stage=${stage} length=${fullResponse.length}`
  );
  // eslint-disable-next-line no-console
  console.error(`[assistant.parseProposalResponse] full_response=${fullResponse}`);
}

/**
 * Fix A1: Bracket-balanced JSON object extractor.
 *
 * Returns the substring of `s` from the first '{' to its matching '}',
 * correctly skipping braces that appear inside JSON string literals
 * (with escape handling). Returns null if no balanced object exists
 * (e.g. truncated input where depth never returns to 0).
 *
 * This replaces the greedy regex `/\{[\s\S]*\}/` which mishandles
 * prose containing stray '}' characters after the actual JSON.
 */
export function extractBalancedJson(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return s.substring(start, i + 1);
    }
  }
  return null;
}

/**
 * Fix A4: OpenAI structured output schema for AI Generate proposals.
 *
 * Mirrors the runtime validation rules in VALID_KINDS / ALLOWED_EXTENSIONS
 * so that strict mode rejects any artifact that the validator would later refuse.
 * NOTE: kept as `any` because the OpenAI JSON-Schema dialect uses some keys
 * that are not in the standard TS JSON-Schema typings (additionalProperties: false
 * is required at every level under strict mode).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROPOSAL_RESPONSE_JSON_SCHEMA: any = {
  type: "object",
  additionalProperties: false,
  required: ["choices"],
  properties: {
    choices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "scope", "artifacts", "applySteps", "rollbackSteps", "riskNotes", "questions"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          scope: { type: "string", enum: ["global", "project", "local"] },
          artifacts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              // Phase 1-fix V2: OpenAI strict-mode requires `required` to list
              // EVERY property key. Optional fields are represented as nullable
              // unions (type: ["<t>", "null"]) and the model emits `null` for
              // unused fields. The runtime normalizer (parseProposalResponse /
              // normalizeArtifactPatch) treats null and undefined identically.
              required: ["kind", "name", "targetPathHint", "content", "patch", "dependsOn"],
              properties: {
                kind: {
                  type: "string",
                  enum: ["command", "agent", "skill", "script", "hook", "claudeMdPatch", "settingsJsonPatch"],
                },
                name: { type: "string" },
                targetPathHint: { type: ["string", "null"] },
                content: { type: ["string", "null"] },
                // Phase 1-fix: declared as nullable JSON-encoded string. The consumer
                // (normalizeArtifactPatch) JSON.parses it back to an object. This is
                // the only OpenAI strict-mode-compatible way to represent an open
                // object: nested objects with additionalProperties:true are rejected.
                patch: {
                  type: ["string", "null"],
                  description: "JSON-encoded patch object. Must be valid JSON (e.g. for settingsJsonPatch this is the merge-patch object stringified). Use null when not applicable.",
                },
                dependsOn: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
              },
            },
          },
          applySteps: { type: "array", items: { type: "string" } },
          rollbackSteps: { type: "array", items: { type: "string" } },
          riskNotes: { type: "array", items: { type: "string" } },
          questions: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

/**
 * Fix A4: builds the OpenAI `response_format` parameter for json_schema strict mode.
 */
export function buildOpenAIResponseFormat(): {
  type: "json_schema";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json_schema: { name: string; strict: boolean; schema: any };
} {
  return {
    type: "json_schema",
    json_schema: {
      name: "AIGenerateProposal",
      strict: true,
      schema: PROPOSAL_RESPONSE_JSON_SCHEMA,
    },
  };
}

/**
 * Attempt to repair truncated JSON from LLM output that was cut off mid-response.
 * Closes unclosed brackets/braces and truncates at the last complete element.
 */
export function repairTruncatedJson(input: string): string | null {
  // Must start with { to be a JSON object
  const trimmed = input.trim();
  if (!trimmed.startsWith("{")) return null;

  // Count unclosed brackets/braces (ignoring those inside strings)
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // If nothing is unclosed, no repair needed
  if (stack.length === 0) return null;

  // Truncate after the last complete value (find last comma, colon, or closing bracket outside string)
  let truncateAt = trimmed.length;
  let sInStr = false;
  let sEscape = false;
  let lastSafe = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (sEscape) { sEscape = false; continue; }
    if (ch === "\\") { sEscape = true; continue; }
    if (ch === '"') { sInStr = !sInStr; continue; }
    if (sInStr) continue;
    if (ch === "," || ch === "}" || ch === "]") lastSafe = i;
  }

  if (lastSafe > 0) {
    const ch = trimmed[lastSafe];
    // If last safe char is a comma, trim it and everything after
    if (ch === ",") {
      truncateAt = lastSafe;
    } else {
      truncateAt = lastSafe + 1;
    }
  }

  let repaired = trimmed.substring(0, truncateAt);

  // Recount unclosed after truncation
  const stack2: string[] = [];
  let s2 = false, e2 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (e2) { e2 = false; continue; }
    if (ch === "\\") { e2 = true; continue; }
    if (ch === '"') { s2 = !s2; continue; }
    if (s2) continue;
    if (ch === "{") stack2.push("}");
    else if (ch === "[") stack2.push("]");
    else if (ch === "}" || ch === "]") stack2.pop();
  }

  // Close unclosed brackets in reverse order
  repaired += stack2.reverse().join("");

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

export function parseProposalResponse(
  rawResponse: string,
  originalPrompt: string
): ProposalPlanSet {
  const planSetId = `plan_${randomUUID()}`;

  // Step 1: strip optional markdown code-block fence.
  // Phase 1-fix V2: only strip when the ENTIRE trimmed response is wrapped in
  // fences. The previous greedy regex (now removed) matched the first ``` and
  // the next ``` anywhere in the body, which destroyed valid JSON whose
  // `content` fields contained embedded code fences (e.g. a script artifact
  // with a bash sample). Detected by R4 regression test and a real OpenAI
  // proposal request that returned a script artifact containing ```bash...```.
  let jsonStr = rawResponse;
  const trimmedRaw = rawResponse.trim();
  if (trimmedRaw.startsWith("```")) {
    // Strip the very first fence line (e.g. "```json") and the trailing fence.
    // Use multi-line regex so we don't gobble across the whole document.
    const fencedMatch = trimmedRaw.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/);
    if (fencedMatch) {
      jsonStr = fencedMatch[1];
    }
  }

  // Step 2 (Fix A1): bracket-balanced extraction.
  // The previous greedy regex /\{[\s\S]*\}/ would capture from the FIRST {
  // to the LAST }, which is invalid when prose after the JSON contains a stray '}'.
  // The balanced extractor stops at the matching closing brace.
  let extracted = extractBalancedJson(jsonStr);

  // Step 3 (Fix A2): always try repair if extraction failed OR parse fails.
  if (!extracted) {
    const repaired = repairTruncatedJson(jsonStr);
    if (!repaired) {
      logFullLlmResponseOnFailure("no_balanced_json_found", rawResponse);
      const preview = rawResponse.substring(0, 200);
      throw new Error(`LLM response does not contain valid JSON. Preview: ${preview}`);
    }
    extracted = repaired;
  }

  const finalJsonStr = extracted;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(finalJsonStr);
  } catch {
    // Even after balanced extraction, parse may fail (e.g. trailing comma); try repair.
    const repaired = repairTruncatedJson(finalJsonStr);
    if (repaired) {
      try {
        parsed = JSON.parse(repaired);
      } catch {
        logFullLlmResponseOnFailure("malformed_json_after_repair", rawResponse);
        const preview = finalJsonStr.substring(0, 200);
        throw new Error(`LLM response contains malformed JSON. Preview: ${preview}`);
      }
    } else {
      logFullLlmResponseOnFailure("malformed_json_no_repair", rawResponse);
      const preview = finalJsonStr.substring(0, 200);
      throw new Error(`LLM response contains malformed JSON. Preview: ${preview}`);
    }
  }

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
        patch: normalizeArtifactPatch(a.patch, a.name as string | undefined),
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


/**
 * Phase 1-fix: normalize artifact.patch.
 *
 * OpenAI strict-mode forced us to declare patch as `type: "string"` in the
 * JSON schema (open objects are rejected). Anthropic's prompt-based path may
 * still emit an object literal, so we accept both:
 *   - string -> JSON.parse  (canonical OpenAI strict-mode path)
 *   - object -> pass through (Anthropic / legacy compatibility)
 *   - undefined / null -> undefined
 *
 * Throws a descriptive error on invalid JSON so the proposal fails fast with
 * an actionable message instead of crashing later inside applyJsonPatch.
 */
export function normalizeArtifactPatch(
  raw: unknown,
  artifactName?: string
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
          `artifact.patch must JSON-decode to an object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`
        );
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Invalid JSON in artifact.patch${artifactName ? ` (artifact "${artifactName}")` : ""}: ${msg}`
      );
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  throw new Error(
    `artifact.patch has unsupported type "${typeof raw}"; expected JSON string or object`
  );
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
