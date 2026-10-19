import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '../pages/AuthPage';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), signIn: vi.fn(), rpc: vi.fn(), reset: vi.fn(), success: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: null, loading: false, authStatus: 'unauthenticated', authError: null,
  clearAuthError: vi.fn(), signUp: mocks.signUp, signIn: mocks.signIn,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, auth: { resetPasswordForEmail: mocks.reset },
} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));

async function submit() {
  const { container } = render(<MemoryRouter initialEntries={['/auth?invite=test-invitation']}><AuthPage /></MemoryRouter>);
  await waitFor(() => expect(container.querySelector<HTMLInputElement>('input[name=email]')?.value).toBe('invitee@example.test'));
  const input = container.querySelector('input[name=password]');
  if (!input) throw new Error('Password input missing');
  fireEvent.change(input, { target: { value: 'test-only-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('invited account signup', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.rpc.mockResolvedValue({ data: { valid: true, email: 'invitee@example.test' } });
    mocks.reset.mockResolvedValue({ error: null });
  });
  it('does not treat an existing account as newly created or try its new password', async () => {
    mocks.signUp.mockResolvedValue({ error: null, data: { user: { identities: [] }, session: null } });
    await submit();
    await screen.findByText(/Cette adresse possède déjà un compte/);
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(localStorage.getItem('pending_invite_token')).toBe('test-invitation');
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser mon mot de passe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith('invitee@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    }));
  });
  it('signs an invited user in directly even when the signup response looks unconfirmed', async () => {
    mocks.signUp.mockResolvedValue({ error: null, data: { user: { identities: [{}], email_confirmed_at: null }, session: null } });
    mocks.signIn.mockResolvedValue({ error: null });
    await submit();
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('invitee@example.test', 'test-only-password'));
    expect(mocks.success).toHaveBeenCalled();
  });
  it('shows the reset notice when the invited sign-in fails', async () => {
    mocks.signUp.mockResolvedValue({ error: null, data: { user: { identities: [{}], email_confirmed_at: null }, session: null } });
    mocks.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await submit();
    await screen.findByText(/Connexion impossible/);
  });
});