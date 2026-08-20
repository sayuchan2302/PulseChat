import type { User, MainView } from '../../types/chat.types';
import {
    SunIcon,
    MoonIcon,
    FriendsIcon,
    SoundIcon,
    MuteIcon,
    FriendRequestIcon,
} from '../../icons/ChatIcons';
import { soundService } from '../../services/soundService';
import { getUserDisplayName, getUserAvatarUrl } from '../../utils/userUtils';

export interface ChatHeaderProps {
    isDark: boolean;
    toggleTheme: () => void;
    mainView: MainView;
    handleOpenFriendsPanel: () => void;
    soundMuted: boolean;
    handleOpenRequestsPanel: () => void;
    friendRequestBadgeCount: number;
    profileMenuOpen: boolean;
    handleToggleProfileMenu: () => void;
    currentUser: User | null;
    setProfileEditorOpen: (open: boolean) => void;
    handleLogout: () => void;
}

export function ChatHeader({
    isDark,
    toggleTheme,
    mainView,
    handleOpenFriendsPanel,
    soundMuted,
    handleOpenRequestsPanel,
    friendRequestBadgeCount,
    profileMenuOpen,
    handleToggleProfileMenu,
    currentUser,
    setProfileEditorOpen,
    handleLogout,
}: ChatHeaderProps) {
    return (
        <header className="chat-header">
            <div className="header-left">
                <h2>Chat App</h2>
            </div>
            <nav className="header-right" aria-label="Account navigation">
                <button
                    type="button"
                    className="header-icon-btn theme-toggle-btn"
                    onClick={toggleTheme}
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {isDark ? <SunIcon className="header-icon" /> : <MoonIcon className="header-icon" />}
                </button>

                <button
                    type="button"
                    className={`header-icon-btn ${mainView === 'friends' ? 'active' : ''}`}
                    onClick={handleOpenFriendsPanel}
                    aria-pressed={mainView === 'friends'}
                    aria-label="Friends list"
                    title="Friends list"
                >
                    <FriendsIcon className="header-icon" />
                </button>

                <div className="friend-request-menu">
                    <button
                        type="button"
                        className={`header-icon-btn ${soundMuted ? 'muted' : ''}`}
                        onClick={() => soundService.toggleMuted()}
                        aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                        title={soundMuted ? 'Sounds muted (click to unmute)' : 'Sounds active (click to mute)'}
                    >
                        {soundMuted ? <MuteIcon className="header-icon" /> : <SoundIcon className="header-icon" />}
                    </button>

                    <button
                        type="button"
                        className={`header-icon-btn ${mainView === 'requests' ? 'active' : ''}`}
                        onClick={handleOpenRequestsPanel}
                        aria-pressed={mainView === 'requests'}
                        aria-label={`Friend requests, ${friendRequestBadgeCount} pending`}
                        title="Friend requests"
                    >
                        <FriendRequestIcon className="header-icon" />
                        {friendRequestBadgeCount > 0 ? (
                            <span className="request-badge">{friendRequestBadgeCount}</span>
                        ) : null}
                    </button>
                </div>

                <div className="profile-menu">
                    <button
                        type="button"
                        className={`header-icon-btn profile-icon-btn ${profileMenuOpen ? 'active' : ''}`}
                        onClick={handleToggleProfileMenu}
                        aria-expanded={profileMenuOpen}
                        aria-label="Account menu"
                        title="Account menu"
                    >
                        <img
                            src={getUserAvatarUrl(currentUser)}
                            alt={getUserDisplayName(currentUser)}
                            className="header-avatar"
                        />
                    </button>

                    {profileMenuOpen ? (
                        <div className="profile-dropdown" role="menu">
                            <div className="profile-dropdown-header">
                                <strong>{getUserDisplayName(currentUser)}</strong>
                                <small>@{currentUser?.username}</small>
                            </div>
                            <button
                                type="button"
                                className="profile-dropdown-item"
                                onClick={() => {
                                    handleToggleProfileMenu();
                                    setProfileEditorOpen(true);
                                }}
                                role="menuitem"
                            >
                                Edit Profile
                            </button>
                            <button
                                type="button"
                                className="profile-dropdown-item logout"
                                onClick={handleLogout}
                                role="menuitem"
                            >
                                Sign Out
                            </button>
                        </div>
                    ) : null}
                </div>
            </nav>
        </header>
    );
}

export default ChatHeader;
