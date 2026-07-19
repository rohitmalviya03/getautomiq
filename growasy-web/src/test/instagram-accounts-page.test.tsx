import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstagramAccountsPage } from '@/pages/dashboard/InstagramAccountsPage';
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

const ACCOUNTS: InstagramAccount[] = [
  {
    id: 'acc-1',
    instagramBusinessId: 'ig-1',
    facebookPageId: null,
    username: 'acmecoffee',
    name: 'Acme Coffee',
    profilePictureUrl: null,
    status: 'CONNECTED',
    connectedByUserId: 'u1',
    lastSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'acc-2',
    instagramBusinessId: 'ig-2',
    facebookPageId: null,
    username: 'acmeoutlet',
    name: null,
    profilePictureUrl: null,
    status: 'TOKEN_EXPIRED',
    connectedByUserId: 'u1',
    lastSyncedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function renderAccountsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/instagram/accounts']}>
        <ToastProvider>
          <InstagramAccountsPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InstagramAccountsPage', () => {
  beforeEach(() => {
    vi.mocked(instagramApi.listAccounts).mockReset();
    vi.mocked(instagramApi.getOAuthUrl).mockReset();
    vi.mocked(instagramApi.getOAuthUrl).mockResolvedValue({
      url: 'https://facebook.com/dialog/oauth?x=1',
      state: 'st-1',
    });
  });

  it('renders a card per account with status badges and sync info', async () => {
    vi.mocked(instagramApi.listAccounts).mockResolvedValue(ACCOUNTS);

    renderAccountsPage();

    expect(await screen.findByText('@acmecoffee')).toBeInTheDocument();
    expect(screen.getByText('@acmeoutlet')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Token expired')).toBeInTheDocument();
    expect(screen.getByText(/last synced never/i)).toBeInTheDocument();
    // CONNECTED account gets a Sync button; the TOKEN_EXPIRED one gets Reconnect.
    expect(screen.getAllByRole('button', { name: /^sync$/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /reconnect/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /disconnect/i })).toHaveLength(2);
  });

  it('shows an empty state with a connect action when no accounts exist', async () => {
    vi.mocked(instagramApi.listAccounts).mockResolvedValue([]);

    renderAccountsPage();

    expect(await screen.findByText(/no instagram accounts connected/i)).toBeInTheDocument();
    // Header button + empty-state button.
    expect(
      screen.getAllByRole('button', { name: /connect instagram account/i }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('shows the "not configured" callout when the oauth url probe fails with 503', async () => {
    vi.mocked(instagramApi.listAccounts).mockResolvedValue([]);
    vi.mocked(instagramApi.getOAuthUrl).mockRejectedValue(
      new ApiError('META_NOT_CONFIGURED', 'Meta integration is not configured', 503),
    );

    renderAccountsPage();

    expect(
      await screen.findByText(/meta app credentials are not configured yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/META_APP_ID/)).toBeInTheDocument();

    // The primary connect button is disabled while unconfigured.
    const connectButtons = screen.getAllByRole('button', { name: /connect instagram account/i });
    connectButtons.forEach((button) => expect(button).toBeDisabled());
  });
});
