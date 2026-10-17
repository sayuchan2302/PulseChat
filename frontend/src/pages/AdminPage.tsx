import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../config/constants';
import { useAuth } from '../context/useAuth';
import { apiClient } from '../services/api';
import type { AdminAccount, AdminAccountPage, AccountRole } from '../types';
import './AdminPage.css';

const PAGE_SIZE = 25;

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [accounts, setAccounts] = useState<AdminAccountPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError('');
      apiClient.get<AdminAccountPage>('/admin/accounts', {
        params: { query: query.trim() || undefined, page, size: PAGE_SIZE },
        signal: controller.signal,
      }).then((response) => {
        setAccounts(response.data);
      }).catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, 'Unable to load accounts.'));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, query.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [page, query]);

  const updateAccount = async (account: AdminAccount, change: 'role' | 'status') => {
    setPendingUserId(account.id);
    setError('');
    setNotice('');
    try {
      const endpoint = `/admin/accounts/${account.id}/${change}`;
      const response = change === 'role'
        ? await apiClient.patch<AdminAccount>(endpoint, {
          accountRole: account.accountRole === 'ADMIN' ? 'USER' satisfies AccountRole : 'ADMIN' satisfies AccountRole,
        })
        : await apiClient.patch<AdminAccount>(endpoint, { enabled: !account.enabled });

      setAccounts((current) => current && ({
        ...current,
        items: current.items.map((item) => item.id === account.id ? response.data : item),
      }));
      setNotice(`${account.username}'s account was updated.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to update this account.'));
    } finally {
      setPendingUserId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.HOME, { replace: true });
  };

  const items = accounts?.items ?? [];
  const totalPages = accounts?.totalPages ?? 0;

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div className="admin-brand"><span className="admin-brand-mark">P</span><span>PulseChat</span></div>
        <nav className="admin-topbar-actions" aria-label="Admin navigation">
          <span className="admin-user-label">Signed in as <strong>{user?.username}</strong></span>
          <button type="button" className="admin-secondary-button" onClick={() => navigate(ROUTES.CHAT)}>
            Back to chat
          </button>
          <button type="button" className="admin-secondary-button" onClick={() => void handleLogout()}>
            Log out
          </button>
        </nav>
      </header>

      <section className="admin-content" aria-labelledby="admin-title">
        <div className="admin-heading-row">
          <div>
            <p className="admin-eyebrow">ADMINISTRATION</p>
            <h1 id="admin-title">Account management</h1>
            <p className="admin-subtitle">Search accounts, manage access roles, and control account status.</p>
          </div>
          <div className="admin-count-card">
            <span>Accounts</span>
            <strong>{accounts?.totalElements ?? '—'}</strong>
          </div>
        </div>

        <section className="admin-panel" aria-label="Accounts">
          <div className="admin-toolbar">
            <label className="admin-search-label" htmlFor="admin-account-search">Find an account</label>
            <input
              id="admin-account-search"
              className="admin-search"
              type="search"
              value={query}
              placeholder="Search username, name, or email"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <span className="admin-result-count">
              {loading ? 'Loading accounts…' : `${accounts?.totalElements ?? 0} results`}
            </span>
          </div>

          {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
          {notice ? <div className="admin-alert admin-alert-success" role="status">{notice}</div> : null}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Presence</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((account) => {
                  const isCurrentUser = account.id === user?.id;
                  const isPending = pendingUserId === account.id;
                  return (
                    <tr key={account.id}>
                      <td data-label="Account">
                        <div className="admin-account-identity">
                          <span className="admin-avatar" aria-hidden="true">
                            {(account.fullName?.trim() || account.username).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="admin-account-copy">
                            <strong>{account.fullName?.trim() || account.username}</strong>
                            <span>@{account.username} · {account.email}</span>
                          </span>
                        </div>
                      </td>
                      <td data-label="Role"><span className={`admin-role-badge ${account.accountRole.toLowerCase()}`}>{account.accountRole}</span></td>
                      <td data-label="Status"><span className={`admin-status-badge ${account.enabled ? 'enabled' : 'disabled'}`}>{account.enabled ? 'Active' : 'Disabled'}</span></td>
                      <td data-label="Presence"><span className={`admin-presence ${account.online ? 'online' : ''}`}><i />{account.online ? 'Online' : 'Offline'}</span></td>
                      <td data-label="Joined" className="admin-date-cell">{formatCreatedAt(account.createdAt)}</td>
                      <td data-label="Actions">
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-action-button"
                            disabled={isPending || isCurrentUser}
                            onClick={() => void updateAccount(account, 'role')}
                          >
                            {account.accountRole === 'ADMIN' ? 'Make user' : 'Make admin'}
                          </button>
                          <button
                            type="button"
                            className={`admin-action-button ${account.enabled ? 'danger' : 'restore'}`}
                            disabled={isPending || (isCurrentUser && account.enabled)}
                            onClick={() => void updateAccount(account, 'status')}
                          >
                            {isPending ? 'Saving…' : account.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && items.length === 0 ? (
                  <tr><td className="admin-empty-cell" colSpan={6}>No accounts match this search.</td></tr>
                ) : null}
                {loading && items.length === 0 ? (
                  <tr><td className="admin-empty-cell" colSpan={6}>Loading accounts…</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <footer className="admin-pagination">
            <span>{accounts && accounts.totalElements > 0
              ? `Page ${accounts.page + 1} of ${Math.max(totalPages, 1)}`
              : 'No accounts'}</span>
            <div>
              <button type="button" className="admin-secondary-button" disabled={page <= 0 || loading} onClick={() => setPage((current) => current - 1)}>
                Previous
              </button>
              <button type="button" className="admin-secondary-button" disabled={loading || page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </button>
            </div>
          </footer>
        </section>
        <p className="admin-footnote">Your own account cannot be disabled or demoted. At least one active admin must remain.</p>
      </section>
    </main>
  );
}
