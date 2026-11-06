import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceEscapeKey } from './useWorkspaceEscapeKey';

function buildBaseOptions() {
  return {
    lightboxState: null,
    setLightboxState: vi.fn(),
    conversationDeleteTarget: null,
    conversationSettingPendingKey: null,
    setConversationDeleteTarget: vi.fn(),
    groupSeenModalMessage: null,
    setGroupSeenModalMessage: vi.fn(),
    reactionModalGroups: null,
    setReactionModalGroups: vi.fn(),
    mediaViewerMessage: null,
    setMediaViewerMessage: vi.fn(),
    forwardingMessage: null,
    setForwardingMessage: vi.fn(),
    addMembersModalOpen: false,
    setAddMembersModalOpen: vi.fn(),
    inviteModalOpen: false,
    setInviteModalOpen: vi.fn(),
    activeViewedProfileUser: null,
    handleCloseUserProfile: vi.fn(),
    detailsOpen: false,
    setDetailsOpen: vi.fn(),
    profileMenuOpen: false,
    setProfileMenuOpen: vi.fn(),
  };
}

describe('useWorkspaceEscapeKey', () => {
  it('closes lightbox first when both lightbox and details sidebar are open', () => {
    const options = {
      ...buildBaseOptions(),
      lightboxState: { items: [{ url: '/img.png', type: 'IMAGE' as const }], index: 0 },
      detailsOpen: true,
    };

    renderHook(() => useWorkspaceEscapeKey(options));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(options.setLightboxState).toHaveBeenCalledWith(null);
    expect(options.setDetailsOpen).not.toHaveBeenCalled();
  });

  it('closes details sidebar before profile menu when no higher modal is open', () => {
    const options = {
      ...buildBaseOptions(),
      detailsOpen: true,
      profileMenuOpen: true,
    };

    renderHook(() => useWorkspaceEscapeKey(options));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(options.setDetailsOpen).toHaveBeenCalledWith(false);
    expect(options.setProfileMenuOpen).not.toHaveBeenCalled();
  });
});

