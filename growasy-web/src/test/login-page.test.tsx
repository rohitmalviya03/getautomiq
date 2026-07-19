import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ToastProvider } from '@/components/ui/toast-context';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/auth-api';
import type { LoginResponse } from '@/types/api';

vi.mock('@/lib/auth-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-api')>();
  return {
    ...actual,
    authApi: { ...actual.authApi, login: vi.fn() },
  };
});

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(authApi.login).mockReset();
    useAuthStore.setState({
      user: null,
      organizations: [],
      activeOrganizationId: null,
      accessToken: null,
      status: 'unknown',
    });
  });

  it('shows validation errors and does not call the API when submitted empty', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('shows an error for a malformed email without calling the API', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'somepassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('calls the login action with form values on valid submit and updates auth state', async () => {
    const mockResponse: LoginResponse = {
      user: {
        id: 'u1',
        email: 'jane@acme.com',
        firstName: 'Jane',
        lastName: 'Doe',
        isEmailVerified: true,
        status: 'ACTIVE',
        organizationId: 'org-1',
      },
      organizations: [
        { id: 'org-1', name: "Jane's Workspace", slug: 'janes-workspace', role: 'owner' },
      ],
      tokens: { accessToken: 'access-token-123', expiresIn: '15m' },
    };
    vi.mocked(authApi.login).mockResolvedValue(mockResponse);

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'jane@acme.com');
    await user.type(screen.getByLabelText(/^password$/i), 'correct-password');
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'jane@acme.com',
        password: 'correct-password',
        rememberMe: true,
      });
    });

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated');
    });
    expect(useAuthStore.getState().user?.email).toBe('jane@acme.com');
    expect(useAuthStore.getState().accessToken).toBe('access-token-123');
  });
});
