import type { MainView } from '../../types/chat.types';
import type { User } from '../../types';
import {
  BellIcon,
  FriendRequestIcon,
  FriendsIcon,
  MoonIcon,
  MuteIcon,
  ProfileIcon,
  SoundIcon,
  SunIcon,
} from '../../icons/ChatIcons';
import { renderUserAvatar } from '../../utils/renderUtils';

export interface AppHeaderProps {
  isDark: boolean;
  mainView: MainView;
  soundMuted: boolean;
  friendRequestBadgeCount: number;
  profileMenuOpen: boolean;
  currentUser: User | null;
  currentUserDisplayName: string;
  currentUserOnline: boolean;
  browserNotificationPermission: NotificationPermission;
  browserNotificationStatusLabel: string;
  isBrowserNotificationAvailable: boolean;
  onToggleTheme: () => void;
  onOpenFriends: () => void;
  onToggleSound: () => void;
  onOpenRequests: () => void;
  onToggleProfileMenu: () => void;
  onBrowserNotificationAction: () => void;
  onOpenProfileEditor: () => void;
  onLogout: () => void;
}

export function AppHeader({
  isDark,
  mainView,
  soundMuted,
  friendRequestBadgeCount,
  profileMenuOpen,
  currentUser,
  currentUserDisplayName,
  currentUserOnline,
  browserNotificationPermission,
  browserNotificationStatusLabel,
  isBrowserNotificationAvailable,
  onToggleTheme,
  onOpenFriends,
  onToggleSound,
  onOpenRequests,
  onToggleProfileMenu,
  onBrowserNotificationAction,
  onOpenProfileEditor,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="chat-header">
      <div className="header-left">
        <h2>Chat App</h2>
      </div>
      <nav className="header-right" aria-label="Account navigation">
        <button
          type="button"
          className="header-icon-btn theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <SunIcon className="header-icon" /> : <MoonIcon className="header-icon" />}
        </button>

        <button
          type="button"
          className={`header-icon-btn ${mainView === 'friends' ? 'active' : ''}`}
          onClick={onOpenFriends}
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
            onClick={onToggleSound}
            aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
            title={soundMuted ? 'Sounds muted (click to unmute)' : 'Sounds active (click to mute)'}
          >
            {soundMuted ? <MuteIcon className="header-icon" /> : <SoundIcon className="header-icon" />}
          </button>

          <button
            type="button"
            className={`header-icon-btn ${mainView === 'requests' ? 'active' : ''}`}
            onClick={onOpenRequests}
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
            onClick={onToggleProfileMenu}
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-label={`Profile menu for ${currentUserDisplayName}`}
            title="Profile"
          >
            <ProfileIcon className="header-icon" />
            <span
              className={`profile-presence-dot ${currentUserOnline ? 'online' : 'offline'}`}
              aria-hidden="true"
            />
          </button>

          {profileMenuOpen ? (
            <div className="profile-dropdown" role="menu">
              <div className="profile-summary">
                {renderUserAvatar(currentUser, 'user-avatar small-avatar')}
                <div className="profile-copy">
                  <strong>{currentUserDisplayName}</strong>
                  {currentUser?.username ? <span>@{currentUser.username}</span> : null}
                </div>
              </div>
              <span
                className={`account-status ${currentUserOnline ? 'online' : 'offline'}`}
                aria-live="polite"
                title={currentUserOnline ? 'Online' : 'Offline'}
              >
                <span className="account-status-dot" aria-hidden="true" />
                {currentUserOnline ? 'Online' : 'Offline'}
              </span>
              <button type="button" onClick={onToggleSound} className="profile-sound-btn" role="menuitem">
                {soundMuted ? <MuteIcon className="profile-notification-icon" /> : <SoundIcon className="profile-notification-icon" />}
                <span>{soundMuted ? 'Sounds: Muted' : 'Sounds: Enabled'}</span>
              </button>
              <button
                type="button"
                onClick={onBrowserNotificationAction}
                className="profile-notification-btn"
                role="menuitem"
                disabled={!isBrowserNotificationAvailable || browserNotificationPermission === 'denied'}
                title={browserNotificationStatusLabel}
              >
                <BellIcon className="profile-notification-icon" />
                <span>{browserNotificationStatusLabel}</span>
              </button>
              <button type="button" onClick={onOpenProfileEditor} className="profile-edit-btn" role="menuitem">
                Edit profile
              </button>
              <button type="button" onClick={onLogout} className="profile-logout-btn" role="menuitem">
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

export default AppHeader;
