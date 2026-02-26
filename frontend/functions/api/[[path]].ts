/**
 * Pages Function for API routes
 *
 * This file acts as the entry point for all /api/* requests.
 * It re-exports the Hono app from the worker code.
 */

import app from '../index';

// Pages Functions export interface
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ADMIN_EMAIL: string;
  DEV_MODE?: string;
  DEV_EMAIL?: string;
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx);
  },
};
