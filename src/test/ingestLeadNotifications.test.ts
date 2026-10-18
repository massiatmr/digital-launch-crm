// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('supabase/functions/ingest-lead/index.ts', 'utf8');

async function submitLead(validKey: boolean) {
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const client = {
    functions: { invoke },
    from(table: string) {
      const result = {
        data: table === 'workspace_api_keys'
          ? (validKey ? { id: 'key', workspace_id: 'workspace' } : null)
          : table === 'workspace_members' ? { user_id: 'owner' } : { id: 'lead' },
        error: null,
      };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'limit', 'insert', 'update']) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => result;
      chain.single = async () => result;
      return chain;
    },
  };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'test-internal-credential' : 'https://example.invalid' },
    serve: (callback: typeof handler) => { handler = callback; },
  };
  const compiled = ts.transpileModule(source.replace(/^import .*;\s*/m, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  new Function('createClient', 'Deno', compiled)(() => client, deno);
  if (!handler) throw new Error('Handler was not registered');
  const response = await handler(new Request('https://example.invalid/ingest-lead', {
    method: 'POST',
    headers: { 'x-api-key': 'test-form-key-at-least-20-chars', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', source: 'website' }),
  }));
  return { response, invoke };
}

describe('lead API notification authentication', () => {
  it('passes internal authorization explicitly when notifying a saved form lead', async () => {
    const { response, invoke } = await submitLead(true);
    expect(response.status).toBe(200);
    expect(invoke).toHaveBeenCalledWith('notify-new-lead', {
      headers: { Authorization: 'Bearer test-internal-credential' },
      body: { lead_id: 'lead' },
    });
    expect(invoke.mock.calls.filter(([name]) => name === 'notify-new-lead')).toHaveLength(1);
  });

  it('does not notify when the form API key is invalid', async () => {
    const { response, invoke } = await submitLead(false);
    expect(response.status).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
  });
});