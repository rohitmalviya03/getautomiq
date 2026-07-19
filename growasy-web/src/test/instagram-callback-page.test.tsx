import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstagramCallbackPage } from '@/pages/dashboard/InstagramCallbackPage';
import { ToastProvider } from '@/components/ui/toast-context';
import { instagramApi } from '@/lib/instagram-api';
import { ApiError } from '@/lib/api-client';
import type { InstagramAccount } from '@/types/api';

vi.mock('@/lib/instagram-api', () => ({
  instagramApi: {
    getOAuthUrl: vi.fn(),
    completeOAuthCallback: vi.fn(),
    listAccounts: vi.fn(),
    disconnectAccount: vi.fn(),
    syncAccount: vi.fn(),
  },
}));

const CONNECTED_ACCOUNT: InstagramAccount = {
  id: 'acc-1',
  instagramBusinessId: 'ig-user-123',
  facebookPageId: null,
  username: 'acmecoffee',
  name: 'Acme Coffee Roasters',
  profilePictureUrl: null,
  status: 'CONNECTED',
  connectedByUserId: 'user-1',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderCallbackPage(search = '?code=code-abc&state=st-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/settings/instagram/callback${search}`]}>
        <ToastProvider>
          <InstagramCallbackPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InstagramCallbackPage', () => {
  beforeEach(() => {
    vi.mocked(instagramApi.completeOAuthCallback).mockReset();
  });

  it('exchanges code/state exactly once on mount', async () => {
    vi.mocked(instagramApi.completeOAuthCallback).mockResolvedValue(CONNECTED_ACCOUNT);

    renderCallbackPage();

    // Progress state while the exchange is in flight.
    expect(screen.getByText(/connecting your instagram account/i)).toBeInTheDocument();

    // Wait a tick for the mutation to resolve.
    await screen.findByText(/connecting your instagram account/i);
    expect(instagramApi.completeOAuthCallback).toHaveBeenCalledTimes(1);
    expect(instagramApi.completeOAuthCallback).toHaveBeenCalledWith('code-abc', 'st-1');
  });

  it('shows an expired-state error with a restart action on 401', async () => {
    vi.mocked(instagramApi.completeOAuthCallback).mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Invalid or expired state', 401),
    );

    renderCallbackPage();

    expect(await screen.findByText(/connection attempt has expired/i)).toBeInTheDocument();
    const restart = screen.getByRole('link', { name: /restart the connection/i });
    expect(restart).toHaveAttribute('href', '/instagram/accounts');
  });

  it('shows a 409 already-connected error', async () => {
    vi.mocked(instagramApi.completeOAuthCallback).mockRejectedValue(
      new ApiError(
        'CONFLICT',
        'This Instagram account is already connected to this workspace',
        409,
      ),
    );

    renderCallbackPage();

    expect(await screen.findByText(/account already connected/i)).toBeInTheDocument();
    expect(screen.getByText(/already connected to this workspace/i)).toBeInTheDocument();
  });

  it('shows the Instagram error description when the user cancels the dialog', async () => {
    renderCallbackPage('?error=access_denied&error_description=User%20denied%20the%20request');

    expect(await screen.findByText(/connection was not completed/i)).toBeInTheDocument();
    expect(screen.getByText(/user denied the request/i)).toBeInTheDocument();
    expect(instagramApi.completeOAuthCallback).not.toHaveBeenCalled();
  });
});
