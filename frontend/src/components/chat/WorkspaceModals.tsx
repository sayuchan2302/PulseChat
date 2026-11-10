import { lazy, Suspense } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { CallType, ChatRoom, GlobalMessageSearchItem, User } from '../../types';
import type { ChatDialogLayerProps } from './ChatDialogLayer';

const GlobalMessageSearchModal = lazy(() => import('./GlobalMessageSearchModal'));
const ProfileViewerModal = lazy(() => import('./ProfileViewerModal'));
const BlockedUsersModal = lazy(() => import('./BlockedUsersModal'));
const ProfileEditorModal = lazy(() => import('./ProfileEditorModal'));
const CreateGroupModal = lazy(() => import('./CreateGroupModal'));
const ChatDialogLayer = lazy(() => import('./ChatDialogLayer'));

export interface WorkspaceModalsProps {
  globalSearchOpen: boolean;
  onCloseGlobalSearch: () => void;
  onOpenGlobalSearchResult: (item: GlobalMessageSearchItem) => Promise<void>;

  activeViewedProfileUser: User | null;
  viewedProfileLoading: boolean;
  viewedProfileError: string;
  profileActionError: string;
  friendActionKeys: string[];
  callActive: boolean;
  activeProfileUserIsBlocked: boolean;
  blockActionPendingUserId: number | null;
  onCloseUserProfile: () => void;
  onOpenChatFromProfile: (user: User) => void;
  onStartCallFromProfile: (user: User, callType: CallType) => void;
  onSendFriendRequest: (user: User) => void;
  onAcceptFriendRequest: (requestId: number, actionKey: string) => void;
  onDeclineFriendRequest: (requestId: number, actionKey: string) => void;
  onCancelFriendRequest: (user: User) => void;
  onUnfriend: (user: User) => void;
  onToggleBlock: (user: User) => void;

  blockedUsersOpen: boolean;
  blockedUsers: User[];
  blockedUsersLoading: boolean;
  blockedUsersError: string;
  onCloseBlockedUsers: () => void;

  profileEditorOpen: boolean;
  currentUser: User | null;
  profileFullName: string;
  profileBio: string;
  profileAvatarPreview: string;
  profileSaving: boolean;
  profileError: string;
  onCloseProfileEditor: () => void;
  onUpdateProfile: (event: FormEvent<HTMLFormElement>) => void;
  onProfileAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onProfileFullNameChange: (value: string) => void;
  onProfileBioChange: (value: string) => void;

  createGroupOpen: boolean;
  friends: User[];
  rooms: ChatRoom[];
  groupName: string;
  selectedGroupMemberIds: number[];
  groupMemberRequirementText: string;
  groupCreating: boolean;
  canCreateGroup: boolean;
  groupError: string;
  onCloseCreateGroup: () => void;
  onCreateGroup: (event: FormEvent<HTMLFormElement>) => void;
  onGroupNameChange: (value: string) => void;
  onToggleGroupMember: (userId: number) => void;

  dialogProps: ChatDialogLayerProps;
}

export function WorkspaceModals({
  globalSearchOpen,
  onCloseGlobalSearch,
  onOpenGlobalSearchResult,
  activeViewedProfileUser,
  viewedProfileLoading,
  viewedProfileError,
  profileActionError,
  friendActionKeys,
  callActive,
  activeProfileUserIsBlocked,
  blockActionPendingUserId,
  onCloseUserProfile,
  onOpenChatFromProfile,
  onStartCallFromProfile,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onCancelFriendRequest,
  onUnfriend,
  onToggleBlock,
  blockedUsersOpen,
  blockedUsers,
  blockedUsersLoading,
  blockedUsersError,
  onCloseBlockedUsers,
  profileEditorOpen,
  currentUser,
  profileFullName,
  profileBio,
  profileAvatarPreview,
  profileSaving,
  profileError,
  onCloseProfileEditor,
  onUpdateProfile,
  onProfileAvatarChange,
  onProfileFullNameChange,
  onProfileBioChange,
  createGroupOpen,
  friends,
  groupName,
  selectedGroupMemberIds,
  groupMemberRequirementText,
  groupCreating,
  canCreateGroup,
  groupError,
  onCloseCreateGroup,
  onCreateGroup,
  onGroupNameChange,
  onToggleGroupMember,
  dialogProps,
}: WorkspaceModalsProps) {
  return (
    <>
      {globalSearchOpen ? (
        <Suspense fallback={null}>
          <GlobalMessageSearchModal
            onClose={onCloseGlobalSearch}
            onOpenResult={onOpenGlobalSearchResult}
          />
        </Suspense>
      ) : null}

      {activeViewedProfileUser ? (
        <Suspense fallback={null}>
          <ProfileViewerModal
            user={activeViewedProfileUser}
            loading={viewedProfileLoading}
            error={viewedProfileError}
            actionError={profileActionError}
            pendingActionKeys={friendActionKeys}
            callActive={callActive}
            blockedByCurrentUser={activeProfileUserIsBlocked}
            blockActionPending={blockActionPendingUserId === activeViewedProfileUser.id}
            onClose={onCloseUserProfile}
            onOpenChat={onOpenChatFromProfile}
            onStartCall={onStartCallFromProfile}
            onSendFriendRequest={onSendFriendRequest}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onDeclineFriendRequest={onDeclineFriendRequest}
            onCancelFriendRequest={onCancelFriendRequest}
            onUnfriend={onUnfriend}
            onToggleBlock={onToggleBlock}
          />
        </Suspense>
      ) : null}

      {blockedUsersOpen ? (
        <Suspense fallback={null}>
          <BlockedUsersModal
            open={blockedUsersOpen}
            users={blockedUsers}
            loading={blockedUsersLoading}
            error={blockedUsersError}
            pendingUserId={blockActionPendingUserId}
            onClose={onCloseBlockedUsers}
            onUnblock={onToggleBlock}
          />
        </Suspense>
      ) : null}

      {profileEditorOpen ? (
        <Suspense fallback={null}>
          <ProfileEditorModal
            open={profileEditorOpen}
            currentUser={currentUser}
            fullName={profileFullName}
            bio={profileBio}
            avatarPreview={profileAvatarPreview}
            saving={profileSaving}
            error={profileError}
            onClose={onCloseProfileEditor}
            onSubmit={onUpdateProfile}
            onAvatarChange={onProfileAvatarChange}
            onFullNameChange={onProfileFullNameChange}
            onBioChange={onProfileBioChange}
          />
        </Suspense>
      ) : null}

      {createGroupOpen ? (
        <Suspense fallback={null}>
          <CreateGroupModal
            open={createGroupOpen}
            friends={friends}
            groupName={groupName}
            selectedMemberIds={selectedGroupMemberIds}
            requirementText={groupMemberRequirementText}
            creating={groupCreating}
            canCreate={canCreateGroup}
            error={groupError}
            onClose={onCloseCreateGroup}
            onSubmit={onCreateGroup}
            onGroupNameChange={onGroupNameChange}
            onToggleMember={onToggleGroupMember}
          />
        </Suspense>
      ) : null}

      {(
        dialogProps.editingMessage ||
        dialogProps.messageToDeleteForMe ||
        dialogProps.mediaViewerUrl ||
        dialogProps.conversationDeleteTarget ||
        dialogProps.forwardingMessage ||
        (dialogProps.addMembersModalOpen && dialogProps.selectedRoom) ||
        (dialogProps.inviteModalOpen && dialogProps.selectedRoom) ||
        dialogProps.lightboxState ||
        dialogProps.groupSeenModalMessage ||
        dialogProps.reactionModalGroups
      ) ? (
        <Suspense fallback={null}>
          <ChatDialogLayer {...dialogProps} />
        </Suspense>
      ) : null}
    </>
  );
}

export default WorkspaceModals;

