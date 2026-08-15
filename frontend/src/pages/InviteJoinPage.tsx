import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../services/api';
import type { GroupPreviewResponse, ChatRoom } from '../types';
import { ROUTES } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import './InviteJoinPage.css';

export default function InviteJoinPage() {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const navigate = useNavigate();
    const { isDark } = useTheme();

    const [preview, setPreview] = useState<GroupPreviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState('');

    const isAuthenticated = Boolean(
        localStorage.getItem('token') && localStorage.getItem('user')
    );

    useEffect(() => {
        if (!inviteCode) {
            setError('Invalid invite code.');
            setLoading(false);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError('');

        apiClient
            .get<GroupPreviewResponse>(`/rooms/join/${inviteCode}/preview`)
            .then((res) => {
                if (isMounted) {
                    setPreview(res.data);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.error('Failed to fetch group preview:', err);
                    setError(
                        err.response?.data?.message ||
                        'Invite link is invalid or has expired.'
                    );
                }
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [inviteCode]);

    const handleJoinGroup = async () => {
        if (!inviteCode || joining) return;
        if (!isAuthenticated) {
            // Save invite destination to redirect back after login
            sessionStorage.setItem('redirect_after_login', `/invite/${inviteCode}`);
            navigate(ROUTES.HOME);
            return;
        }

        setJoining(true);
        setJoinError('');

        try {
            const response = await apiClient.post<ChatRoom>(`/rooms/join/${inviteCode}`);
            const room = response.data;
            navigate(`${ROUTES.CHAT}/room/${room.id}`, { replace: true });
        } catch (err: any) {
            console.error('Failed to join group:', err);
            setJoinError(
                err.response?.data?.message || 'Unable to join group. Please try again.'
            );
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className={`invite-join-page ${isDark ? 'dark' : ''}`}>
            <div className="invite-join-card">
                {loading ? (
                    <div className="invite-join-loading">
                        <div className="invite-spinner" />
                        <p>Loading group details...</p>
                    </div>
                ) : error ? (
                    <div className="invite-join-error-state">
                        <div className="invite-icon-error">⚠️</div>
                        <h2>Unable to join group</h2>
                        <p>{error}</p>
                        <Link to={ROUTES.CHAT} className="invite-btn secondary">
                            Back to home
                        </Link>
                    </div>
                ) : preview ? (
                    <div className="invite-join-content">
                        <div className="invite-group-avatar-wrap">
                            {preview.avatar ? (
                                <img
                                    src={preview.avatar}
                                    alt={preview.name}
                                    className="invite-group-avatar"
                                />
                            ) : (
                                <div className="invite-group-avatar-initial">
                                    {preview.name.trim().charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>

                        <div className="invite-header-badge">Group Invitation</div>
                        <h2 className="invite-group-name">{preview.name}</h2>

                        <div className="invite-group-meta">
                            <span className="invite-meta-item">
                                👥 <strong>{preview.memberCount}</strong> members
                            </span>
                            {preview.ownerFullName || preview.ownerUsername ? (
                                <span className="invite-meta-item">
                                    👑 Owner:{' '}
                                    <strong>
                                        {preview.ownerFullName || preview.ownerUsername}
                                    </strong>
                                </span>
                            ) : null}
                        </div>

                        {joinError ? (
                            <div className="invite-alert-error">{joinError}</div>
                        ) : null}

                        <div className="invite-actions">
                            <button
                                type="button"
                                className="invite-btn primary"
                                disabled={joining}
                                onClick={handleJoinGroup}
                            >
                                {joining
                                    ? 'Joining...'
                                    : isAuthenticated
                                        ? 'Join Group Now'
                                        : 'Log in to Join'}
                            </button>

                            <Link to={ROUTES.CHAT} className="invite-btn ghost">
                                Cancel
                            </Link>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
