/**
 * Template Routes - CRUD API for Input/Output Templates
 *
 * Provides:
 * - Template listing (GET /api/templates)
 * - Template detail (GET /api/templates/:id)
 * - Template creation (POST /api/templates)
 * - Template update (PUT /api/templates/:id)
 * - Template deletion (DELETE /api/templates/:id)
 * - Template copy (POST /api/templates/:id/copy)
 *
 * Templates define reusable input/output prompt text that can be
 * assigned to projects via dropdown selection.
 */

import { Router, Request, Response } from 'express';
import {
  TemplateStore,
  validateTemplate,
  type Template,
} from '../../template';

export interface TemplateRoutesConfig {
  stateDir: string;
}

export function createTemplateRoutes(config: TemplateRoutesConfig): Router {
  const router = Router();

  // Initialize TemplateStore (lazy)
  let store: TemplateStore | null = null;

  async function getStore(): Promise<TemplateStore> {
    if (!store) {
      store = new TemplateStore({ storageDir: config.stateDir });
      await store.initialize();
    }
    return store;
  }

  /**
   * GET /api/templates
   * List all templates (index entries + built-in flag)
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const s = await getStore();
      const entries = s.list();

      // Load full content for each (small list, acceptable)
      const templates = entries.map(entry => {
        const full = s.get(entry.id);
        return full ? {
          id: full.id,
          name: full.name,
          rulesText: full.rulesText,
          outputFormatText: full.outputFormatText,
          enabled: full.enabled,
          isBuiltIn: full.isBuiltIn,
          createdAt: full.createdAt,
          updatedAt: full.updatedAt,
        } : entry;
      });

      res.json({ templates });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  });

  /**
   * GET /api/templates/:id
   * Get a single template by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const s = await getStore();
      const template = s.get(req.params.id as string);

      if (!template) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Template not found' });
        return;
      }

      res.json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  });

  /**
   * POST /api/templates
   * Create a new template
   * Body: { name, rulesText, outputFormatText }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, rulesText, outputFormatText } = req.body;

      // Validate
      const validation = validateTemplate({ name, rulesText: rulesText || '', outputFormatText: outputFormatText || '' });
      if (!validation.valid) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: validation.errors.join(', '),
        });
        return;
      }

      const s = await getStore();
      const template = await s.create(name, rulesText || '', outputFormatText || '');

      res.status(201).json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('already exists')) {
        res.status(409).json({ error: 'DUPLICATE', message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message });
      }
    }
  });

  /**
   * PUT /api/templates/:id
   * Update an existing template
   * Body: { name?, rulesText?, outputFormatText? }
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { name, rulesText, outputFormatText } = req.body;

      const s = await getStore();
      const template = await s.update(req.params.id as string, {
        ...(name !== undefined ? { name } : {}),
        ...(rulesText !== undefined ? { rulesText } : {}),
        ...(outputFormatText !== undefined ? { outputFormatText } : {}),
      });

      res.json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: 'NOT_FOUND', message });
      } else if (message.includes('built-in')) {
        res.status(403).json({ error: 'FORBIDDEN', message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message });
      }
    }
  });

  /**
   * DELETE /api/templates/:id
   * Delete a template
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const s = await getStore();
      await s.delete(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: 'NOT_FOUND', message });
      } else if (message.includes('built-in')) {
        res.status(403).json({ error: 'FORBIDDEN', message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message });
      }
    }
  });

  /**
   * POST /api/templates/:id/copy
   * Copy a template (useful for customizing built-ins)
   * Body: { name }
   */
  router.post('/:id/copy', async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required' });
        return;
      }

      const s = await getStore();
      const template = await s.copy(req.params.id as string, name);

      res.status(201).json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  });

  return router;
}
