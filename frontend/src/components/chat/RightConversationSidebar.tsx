import type { ChangeEvent, Dispatch, FormEvent, KeyboardEvent, RefObject, SetStateAction } from 'react';
import type { ChatRoom, GroupMemberRole, User } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import { getMessageType } from '../../utils/messageUtils';
import { getMediaUrl, getUserDisplayName } from '../../utils/userUtils';
import DetailsSidebar from './DetailsSidebar';
import GroupMemberListItem from './GroupMemberListItem';
import SearchSidebar from './SearchSidebar';
import SharedContentSections from './SharedContentSections';

export interface RightConversationSidebarProps {
  open: boolean;
  rightSidebarTab: 'details' | 'search';
  currentUserId: number | null;
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  handleCloseConversationDetails: () => void;
  handleOpenUserProfile: (user: User) => void | Promise<void>;
  findKnownUserById: (userId: number) => User | null;
  handleJumpToMessage: (messageId: number) => Promise<boolean>;
  handleOpenLightbox: (url: string, type: 'IMAGE' | 'VIDEO', fileName?: string) => void;
  setMediaViewerMessage: Dispatch<SetStateAction<ChatMessage | null>>;

  // Search sidebar props
  messageSearchInputRef: RefObject<HTMLInputElement | null>;
  messageSearchQuery: string;
  messageSearchSubmitted: boolean;
  messageSearchLoading: boolean;
  messageSearchError: string;
  messageSearchItems: ChatMessage[];
  messageSearchHasMore: boolean;
  activeMessageSearchId: number | null;
  handleMessageSearchSubmit: (event: FormEvent) => void;
  handleMessageSearchChange: (value: string) => void;
  handleMessageSearchInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleClearMessageSearch: () => void;
  loadMessageSearch: (options?: { reset?: boolean }) => Promise<void>;
  handleJumpToSearchResult: (id: number) => Promise<void>;

  // Shared content props
  sharedMediaExpanded: boolean;
  setSharedMediaExpanded: Dispatch<SetStateAction<boolean>>;
  sharedFilesExpanded: boolean;
  setSharedFilesExpanded: Dispatch<SetStateAction<boolean>>;
  sharedLinksExpanded: boolean;
  setSharedLinksExpanded: Dispatch<SetStateAction<boolean>>;
  sharedMediaItems: ChatMessage[];
  sharedLinkItems: ChatMessage[];
  sharedMediaLoading: boolean;
  sharedLinksLoading: boolean;
  sharedMediaError: string;
  sharedLinksError: string;
  sharedMediaHasMore: boolean;
  sharedLinksHasMore: boolean;
  loadSharedContent: (tab: 'media' | 'links', options?: { reset?: boolean }) => Promise<void>;

  // Group details props
  selectedRoomOwnerId: number | null;
  selectedRoomOwnerName: string;
  currentUserMemberRole: GroupMemberRole | null;
  isCurrentUserOwner: boolean;
  isCurrentUserModerator: boolean;
  currentUserCanManageSelectedRoom: boolean;
  groupAvatarUploading: boolean;
  groupSettingsSaving: boolean;
  groupSettingsPendingAction: string | null;
  groupSettingsName: string;
  setGroupSettingsName: Dispatch<SetStateAction<string>>;
  isEditingGroupName: boolean;
  setIsEditingGroupName: Dispatch<SetStateAction<boolean>>;
  canSaveGroupSettingsName: boolean;
  groupSettingsError: string;
  setGroupSettingsError: Dispatch<SetStateAction<string>>;
  groupMembersExpanded: boolean;
  setGroupMembersExpanded: Dispatch<SetStateAction<boolean>>;
  groupMemberNicknames: Record<number, string>;
  openGroupMemberMenuId: number | null;
  setOpenGroupMemberMenuId: Dispatch<SetStateAction<number | null>>;
  editingGroupMemberNicknameId: number | null;
  canKickMember: (user: User) => boolean;
  handleGroupAvatarChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUpdateGroupSettingsName: (event: FormEvent) => Promise<void>;
  handleOpenInviteModal: () => Promise<void>;
  handleToggleGroupMemberMenu: (memberId: number) => void;
  handleStartEditGroupMemberNickname: (member: User) => void;
  handleUpdateMemberRole: (member: User, role: GroupMemberRole) => Promise<void>;
  handleTransferRoomOwner: (member: User) => Promise<void>;
  handleKickRoomMember: (member: User) => Promise<void>;
  handleGroupMemberNicknameChange: (memberId: number, value: string) => void;
  handleUpdateRoomMemberNickname: (member: User) => Promise<void>;
  handleCancelEditGroupMemberNickname: (member: User) => void;
  handleDeleteSelectedGroup: () => Promise<void>;
  handleLeaveSelectedGroup: () => Promise<void>;
}

export function RightConversationSidebar(props: RightConversationSidebarProps) {
  const {
    open,
    rightSidebarTab,
    currentUserId,
    selectedUser,
    selectedRoom,
    handleCloseConversationDetails,
    handleOpenUserProfile,
    findKnownUserById,
    handleJumpToMessage,
    handleOpenLightbox,
    messageSearchInputRef,
    messageSearchQuery,
    messageSearchSubmitted,
    messageSearchLoading,
    messageSearchError,
    messageSearchItems,
    messageSearchHasMore,
    activeMessageSearchId,
    handleMessageSearchSubmit,
    handleMessageSearchChange,
    handleMessageSearchInputKeyDown,
    handleClearMessageSearch,
    loadMessageSearch,
    handleJumpToSearchResult,
    sharedMediaExpanded,
    setSharedMediaExpanded,
    sharedFilesExpanded,
    setSharedFilesExpanded,
    sharedLinksExpanded,
    setSharedLinksExpanded,
    sharedMediaItems,
    sharedLinkItems,
    sharedMediaLoading,
    sharedLinksLoading,
    sharedMediaError,
    sharedLinksError,
    sharedMediaHasMore,
    sharedLinksHasMore,
    loadSharedContent,
    selectedRoomOwnerId,
    selectedRoomOwnerName,
    currentUserMemberRole,
    isCurrentUserOwner,
    isCurrentUserModerator,
    currentUserCanManageSelectedRoom,
    groupAvatarUploading,
    groupSettingsSaving,
    groupSettingsPendingAction,
    groupSettingsName,
    setGroupSettingsName,
    isEditingGroupName,
    setIsEditingGroupName,
    canSaveGroupSettingsName,
    groupSettingsError,
    setGroupSettingsError,
    groupMembersExpanded,
    setGroupMembersExpanded,
    groupMemberNicknames,
    openGroupMemberMenuId,
    setOpenGroupMemberMenuId,
    editingGroupMemberNicknameId,
    canKickMember,
    handleGroupAvatarChange,
    handleUpdateGroupSettingsName,
    handleOpenInviteModal,
    handleToggleGroupMemberMenu,
    handleStartEditGroupMemberNickname,
    handleUpdateMemberRole,
    handleTransferRoomOwner,
    handleKickRoomMember,
    handleGroupMemberNicknameChange,
    handleUpdateRoomMemberNickname,
    handleCancelEditGroupMemberNickname,
    handleDeleteSelectedGroup,
    handleLeaveSelectedGroup,
  } = props;

  if (!open) {
    return null;
  }

  const renderDetailsMemberItem = (user: User) => (
    <GroupMemberListItem
      key={user.id}
      user={user}
      currentUserId={currentUserId}
      ownerId={selectedRoomOwnerId}
      currentUserIsOwner={isCurrentUserOwner}
      saving={groupSettingsSaving}
      pendingAction={groupSettingsPendingAction}
      nicknameValue={groupMemberNicknames[user.id] ?? ''}
      menuOpen={openGroupMemberMenuId === user.id}
      editingNickname={editingGroupMemberNicknameId === user.id}
      canKick={canKickMember(user)}
      onToggleMenu={handleToggleGroupMemberMenu}
      onOpenProfile={(member) => {
        setOpenGroupMemberMenuId(null);
        void handleOpenUserProfile(member);
      }}
      onStartEditNickname={handleStartEditGroupMemberNickname}
      onUpdateRole={(member, role) => void handleUpdateMemberRole(member, role)}
      onTransferOwner={(member) => void handleTransferRoomOwner(member)}
      onKick={(member) => void handleKickRoomMember(member)}
      onNicknameChange={handleGroupMemberNicknameChange}
      onSaveNickname={(member) => void handleUpdateRoomMemberNickname(member)}
      onCancelNicknameEdit={handleCancelEditGroupMemberNickname}
    />
  );

  const renderSharedContentSections = () => (
    <SharedContentSections
      sharedMediaExpanded={sharedMediaExpanded}
      setSharedMediaExpanded={setSharedMediaExpanded}
      sharedFilesExpanded={sharedFilesExpanded}
      setSharedFilesExpanded={setSharedFilesExpanded}
      sharedLinksExpanded={sharedLinksExpanded}
      setSharedLinksExpanded={setSharedLinksExpanded}
      sharedMediaItems={sharedMediaItems}
      sharedLinkItems={sharedLinkItems}
      sharedMediaLoading={sharedMediaLoading}
      sharedLinksLoading={sharedLinksLoading}
      sharedMediaError={sharedMediaError}
      sharedLinksError={sharedLinksError}
      sharedMediaHasMore={sharedMediaHasMore}
      sharedLinksHasMore={sharedLinksHasMore}
      loadSharedContent={loadSharedContent}
      onOpenMedia={(message) => {
        const mediaUrl = getMediaUrl(message.mediaUrl);
        if (!mediaUrl) return;
        const mediaType = getMessageType(message) === 'VIDEO' ? 'VIDEO' : 'IMAGE';
        handleOpenLightbox(mediaUrl, mediaType, message.content || (mediaType === 'VIDEO' ? 'video' : 'image'));
      }}
      onJumpToMessage={(messageId) => handleJumpToMessage(messageId).then(() => undefined)}
    />
  );

  const query = messageSearchQuery.trim();
  const showInitialSearchLoading = messageSearchLoading && messageSearchItems.length === 0;
  const conversationName = selectedUser
    ? getUserDisplayName(selectedUser)
    : selectedRoom?.name || 'conversation';

  return (
    <>
      <button
        type="button"
        className="details-backdrop"
        onClick={handleCloseConversationDetails}
        aria-label="Close conversation details"
      />
      {rightSidebarTab === 'search' ? (
        <SearchSidebar
          conversationName={conversationName}
          handleCloseConversationDetails={handleCloseConversationDetails}
          handleMessageSearchSubmit={handleMessageSearchSubmit}
          messageSearchInputRef={messageSearchInputRef}
          messageSearchQuery={messageSearchQuery}
          handleMessageSearchChange={handleMessageSearchChange}
          handleMessageSearchInputKeyDown={handleMessageSearchInputKeyDown}
          handleClearMessageSearch={handleClearMessageSearch}
          messageSearchSubmitted={messageSearchSubmitted}
          query={query}
          showInitialSearchLoading={showInitialSearchLoading}
          messageSearchError={messageSearchError}
          messageSearchItems={messageSearchItems}
          messageSearchHasMore={messageSearchHasMore}
          messageSearchLoading={messageSearchLoading}
          loadMessageSearch={loadMessageSearch}
          selectedRoom={selectedRoom}
          findKnownUserById={findKnownUserById}
          activeMessageSearchId={activeMessageSearchId}
          handleJumpToSearchResult={handleJumpToSearchResult}
        />
      ) : (
        <DetailsSidebar
          selectedUser={selectedUser}
          selectedRoom={selectedRoom}
          handleCloseConversationDetails={handleCloseConversationDetails}
          renderSharedContentSections={renderSharedContentSections}
          currentUserCanManageSelectedRoom={currentUserCanManageSelectedRoom}
          groupAvatarUploading={groupAvatarUploading}
          groupSettingsSaving={groupSettingsSaving}
          handleGroupAvatarChange={handleGroupAvatarChange}
          isEditingGroupName={isEditingGroupName}
          handleUpdateGroupSettingsName={handleUpdateGroupSettingsName}
          groupSettingsName={groupSettingsName}
          setGroupSettingsError={setGroupSettingsError}
          setGroupSettingsName={setGroupSettingsName}
          canSaveGroupSettingsName={canSaveGroupSettingsName}
          groupSettingsPendingAction={groupSettingsPendingAction}
          setIsEditingGroupName={setIsEditingGroupName}
          currentUserMemberRole={currentUserMemberRole}
          isCurrentUserOwner={isCurrentUserOwner}
          isCurrentUserModerator={isCurrentUserModerator}
          handleOpenInviteModal={handleOpenInviteModal}
          selectedRoomOwnerName={selectedRoomOwnerName}
          groupSettingsError={groupSettingsError}
          groupMembersExpanded={groupMembersExpanded}
          setGroupMembersExpanded={setGroupMembersExpanded}
          renderDetailsMemberItem={renderDetailsMemberItem}
          handleDeleteSelectedGroup={handleDeleteSelectedGroup}
          handleLeaveSelectedGroup={handleLeaveSelectedGroup}
        />
      )}
    </>
  );
}

export default RightConversationSidebar;
