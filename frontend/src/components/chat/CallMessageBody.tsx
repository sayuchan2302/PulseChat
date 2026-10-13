import type { User } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import { PhoneIcon, TrashIcon, VideoCallIcon } from '../../icons/ChatIcons';
import { formatMessageTime } from '../../utils/formatUtils';
import { getCallEventLabel } from '../../utils/messageUtils';
import { getUserDisplayName } from '../../utils/userUtils';

interface CallMessageBodyProps {
  message: ChatMessage;
  peer: User | null;
  canCallBack: boolean;
  onCallBack: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
}

export default function CallMessageBody({ message, peer, canCallBack, onCallBack, onDeleteForMe }: CallMessageBodyProps) {
  const isVideoCall = message.callType === 'VIDEO';
  return (
    <div className={`call-message-event ${message.callStatus?.toLowerCase() ?? ''}`}>
      <span className="call-message-icon-wrap" aria-hidden="true">
        {isVideoCall ? <VideoCallIcon className="call-message-icon" /> : <PhoneIcon className="call-message-icon" />}
      </span>
      <span>{getCallEventLabel(message)}</span>
      <small>{formatMessageTime(message.timestamp)}</small>
      {canCallBack && peer ? (
        <button type="button" className="call-message-callback" onClick={() => onCallBack(message)}
          aria-label={`Call ${getUserDisplayName(peer)} again`} title={`Call ${getUserDisplayName(peer)} again`}>
          {isVideoCall ? <VideoCallIcon className="call-message-callback-icon" /> : <PhoneIcon className="call-message-callback-icon" />}
          <span>Call again</span>
        </button>
      ) : null}
      {message.id > 0 ? <button type="button" className="call-message-delete" onClick={() => onDeleteForMe(message)} aria-label="Delete call for me" title="Delete for me"><TrashIcon className="message-action-icon" /></button> : null}
    </div>
  );
}
