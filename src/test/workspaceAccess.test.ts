import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspaceAccess } from '@/lib/workspaceAccess';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), eq: vi.fn(), in: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc,
  from: mocks.from,
} }));

describe('workspace invitation access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table) => ({ select: () => table === 'workspace_members'
      ? { eq: mocks.eq } : { in: mocks.in } }));
  });

  it('links pending invitations before reading existing account memberships without requiring a token', async () => {
    mocks.rpc.mockImplementation(async () => {
      expect(mocks.from).not.toHaveBeenCalled();
      return { error: null };
    });
    mocks.eq.mockResolvedValue({ data: [{ workspace_id: 'sifop', role: 'member' }], error: null });
    mocks.in.mockResolvedValue({ data: [{ id: 'sifop', company_name: 'SIFOP' }], error: null });
    const result = await loadWorkspaceAccess('existing-account');
    expect(mocks.rpc).toHaveBeenCalledWith('accept_pending_workspace_invitations');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'existing-account');
    expect(result).toEqual([{ id: 'sifop', company_name: 'SIFOP', role: 'member' }]);
  });

  it('retains all accessible workspaces and their existing roles', async () => {
    mocks.eq.mockResolvedValue({ data: [
      { workspace_id: 'sifop', role: 'member' }, { workspace_id: 'hksn', role: 'owner' },
    ], error: null });
    mocks.in.mockResolvedValue({ data: [{ id: 'sifop' }, { id: 'hksn' }], error: null });
    expect(await loadWorkspaceAccess('existing-account')).toEqual([
      { id: 'sifop', role: 'member' }, { id: 'hksn', role: 'owner' },
    ]);
    expect(mocks.in).toHaveBeenCalledWith('id', ['sifop', 'hksn']);
  });

  it('does not read memberships after invitation linking fails', async () => {
    const error = new Error('Verified email required');
    mocks.rpc.mockResolvedValue({ error });
    await expect(loadWorkspaceAccess('unverified-account')).rejects.toThrow('Verified email required');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});