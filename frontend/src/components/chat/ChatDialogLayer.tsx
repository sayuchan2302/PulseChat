import { lazy, Suspense } from 'react';
import type { ChatRoom, Message, User } from '../../types';
import type { ChatMessage, ConversationTarget } from '../../types/chat.types';
import type { LightboxMediaItem } from './MediaLightbox';
import type { ReactionDetailGroup } from './ReactionSummaryModal';
import { CloseIcon, TrashIcon } from '../../icons/ChatIcons';
import { getUserDisplayName } from '../../utils/userUtils';
import ForwardPickerBody from './ForwardPickerBody';

const MediaLightbox = lazy(() => import('./MediaLightbox'));
const GroupSeenByModal = lazy(() => import('./GroupSeenByModal'));
const ReactionSummaryModal = lazy(() => import('./ReactionSummaryModal'));
const AddMembersModal = lazy(() => import('./AddMembersModal'));

type LightboxState = { items: LightboxMediaItem[]; index: number } | null;
type GroupSeenModal = { message: Message; seenUsers: User[] } | null;

export interface ChatDialogLayerProps {
  mediaViewerMessage: ChatMessage | null;
  mediaViewerUrl: string | null | undefined;
  mediaViewerType: string;
  onCloseMediaViewer: () => void;
  conversationDeleteTarget: ConversationTarget | null;
  conversationSettingPendingKey: string | null;
  conversationSettingsError: string;
  onCloseConversationDelete: () => void;
  onDeleteConversation: () => void;
  forwardingMessage: ChatMessage | null;
  friends: User[];
  rooms: ChatRoom[];
  onCloseForward: () => void;
  onForward: (targetUserId: number | null, targetRoomId: number | null) => void;
  addMembersModalOpen: boolean;
  selectedRoom: ChatRoom | null;
  addMemberCandidates: User[];
  selectedAddMemberIds: number[];
  groupSettingsSaving: boolean;
  groupSettingsError: string;
  onCloseAddMembers: () => void;
  onToggleAddMember: (userId: number) => void;
  onAddMembers: () => Promise<void>;
  inviteModalOpen: boolean;
  inviteLoading: boolean;
  inviteCopied: boolean;
  inviteError: string;
  inviteRevoking: boolean;
  canManageInvite: boolean;
  getInviteUrl: () => string;
  onCloseInvite: () => void;
  onCopyInvite: () => void;
  onRevokeInvite: () => void;
  lightboxState: LightboxState;
  onCloseLightbox: () => void;
  onSelectLightboxIndex: (index: number) => void;
  groupSeenModalMessage: GroupSeenModal;
  onCloseGroupSeen: () => void;
  reactionModalGroups: ReactionDetailGroup[] | null;
  onCloseReactionSummary: () => void;
}

export function ChatDialogLayer({
  mediaViewerMessage,
  mediaViewerUrl,
  mediaViewerType,
  onCloseMediaViewer,
  conversationDeleteTarget,
  conversationSettingPendingKey,
  conversationSettingsError,
  onCloseConversationDelete,
  onDeleteConversation,
  forwardingMessage,
  friends,
  rooms,
  onCloseForward,
  onForward,
  addMembersModalOpen,
  selectedRoom,
  addMemberCandidates,
  selectedAddMemberIds,
  groupSettingsSaving,
  groupSettingsError,
  onCloseAddMembers,
  onToggleAddMember,
  onAddMembers,
  inviteModalOpen,
  inviteLoading,
  inviteCopied,
  inviteError,
  inviteRevoking,
  canManageInvite,
  getInviteUrl,
  onCloseInvite,
  onCopyInvite,
  onRevokeInvite,
  lightboxState,
  onCloseLightbox,
  onSelectLightboxIndex,
  groupSeenModalMessage,
  onCloseGroupSeen,
  reactionModalGroups,
  onCloseReactionSummary,
}: ChatDialogLayerProps) {
  return <>
    {mediaViewerUrl ? <div className="modal-backdrop media-viewer-backdrop" onClick={onCloseMediaViewer}>
      <div className="media-viewer-modal" role="dialog" aria-modal="true" aria-label={mediaViewerType === 'VIDEO' ? 'Video preview' : 'Image preview'} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="media-viewer-close" onClick={onCloseMediaViewer} aria-label="Close media preview"><CloseIcon className="media-viewer-close-icon" /></button>
        {mediaViewerType === 'VIDEO' ? <video className="media-viewer-video" src={mediaViewerUrl} controls autoPlay /> : <img src={mediaViewerUrl} alt={mediaViewerMessage?.content || 'Shared image preview'} />}
        {mediaViewerMessage?.content ? <div className="media-viewer-caption">{mediaViewerMessage.content}</div> : null}
      </div>
    </div> : null}

    {conversationDeleteTarget ? <div className="modal-backdrop delete-conversation-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title" aria-describedby="delete-conversation-description" onClick={(event) => { if (event.target === event.currentTarget && conversationSettingPendingKey === null) onCloseConversationDelete(); }}>
      <div className="delete-conversation-modal">
        <div className="delete-conversation-icon" aria-hidden="true"><TrashIcon /></div>
        <h3 id="delete-conversation-title">Delete chat?</h3>
        <p id="delete-conversation-description">This removes your conversation with <strong>{conversationDeleteTarget.type === 'user' ? getUserDisplayName(conversationDeleteTarget.user) : conversationDeleteTarget.room.name}</strong> from this account only. Other people will still see it, and new messages will appear normally.</p>
        {conversationSettingsError ? <div className="delete-conversation-error" role="alert">{conversationSettingsError}</div> : null}
        <div className="delete-conversation-actions"><button type="button" className="secondary-btn" autoFocus disabled={conversationSettingPendingKey !== null} onClick={onCloseConversationDelete}>Cancel</button><button type="button" className="delete-conversation-btn" disabled={conversationSettingPendingKey !== null} onClick={onDeleteConversation}>{conversationSettingPendingKey !== null ? 'Deleting…' : 'Delete'}</button></div>
      </div>
    </div> : null}

    {forwardingMessage ? <div className="forward-picker-overlay" role="dialog" aria-modal="true" aria-label="Forward message" onClick={(event) => { if (event.target === event.currentTarget) onCloseForward(); }}>
      <div className="forward-picker-modal"><div className="forward-picker-header"><span className="forward-picker-title">Forward to…</span><button type="button" className="forward-picker-close" onClick={onCloseForward} aria-label="Close">×</button></div><ForwardPickerBody friends={friends} rooms={rooms} onSelect={onForward} /></div>
    </div> : null}

    {addMembersModalOpen && selectedRoom ? <Suspense fallback={null}><AddMembersModal roomName={selectedRoom.name} candidates={addMemberCandidates} selectedMemberIds={selectedAddMemberIds} saving={groupSettingsSaving} error={groupSettingsError} onClose={onCloseAddMembers} onToggleMember={onToggleAddMember} onAddMembers={onAddMembers} /></Suspense> : null}

    {inviteModalOpen && selectedRoom ? <div className="modal-backdrop invite-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title" onClick={(event) => { if (event.target === event.currentTarget) onCloseInvite(); }}>
      <div className="group-modal invite-modal"><div className="group-modal-header"><div><h3 id="invite-modal-title">Group Invite Link</h3><span>Anyone with this link can join {selectedRoom.name}</span></div><button type="button" className="modal-close-btn" onClick={onCloseInvite} aria-label="Close">×</button></div>
        <div className="invite-modal-body">{inviteLoading ? <div className="invite-modal-loading">Loading invite link...</div> : <><div className="invite-link-box"><input type="text" readOnly value={getInviteUrl()} className="invite-link-input" /><button type="button" className={`invite-copy-btn ${inviteCopied ? 'copied' : ''}`} onClick={onCopyInvite}>{inviteCopied ? '✓ Copied' : 'Copy link'}</button></div>{inviteError ? <div className="invite-error-msg">{inviteError}</div> : null}{canManageInvite ? <div className="invite-admin-actions"><p>You can revoke the old link and generate a new invite code if needed:</p><button type="button" className="invite-revoke-btn" disabled={inviteRevoking} onClick={onRevokeInvite}>{inviteRevoking ? 'Generating...' : '🔄 Revoke & Generate new link'}</button></div> : null}</>}</div>
        <div className="group-modal-actions"><button type="button" className="secondary-btn" onClick={onCloseInvite}>Close</button></div>
      </div>
    </div> : null}

    {lightboxState ? <Suspense fallback={null}><MediaLightbox items={lightboxState.items} currentIndex={lightboxState.index} onClose={onCloseLightbox} onSelectIndex={onSelectLightboxIndex} /></Suspense> : null}
    {groupSeenModalMessage ? <Suspense fallback={null}><GroupSeenByModal message={groupSeenModalMessage.message} seenUsers={groupSeenModalMessage.seenUsers} onClose={onCloseGroupSeen} /></Suspense> : null}
    {reactionModalGroups ? <Suspense fallback={null}><ReactionSummaryModal reactionGroups={reactionModalGroups} onClose={onCloseReactionSummary} /></Suspense> : null}
  </>;
}

export default ChatDialogLayer;
