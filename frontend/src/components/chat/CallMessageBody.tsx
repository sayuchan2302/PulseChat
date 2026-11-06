import React from 'react';
import type { User } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import {
  PhoneIcon,
  PhoneMissedIcon,
  PhoneIncomingIcon,
  PhoneOutgoingIcon,
  TrashIcon,
  VideoCallIcon,
} from '../../icons/ChatIcons';
import { formatMessageTime } from '../../utils/formatUtils';
import { formatCallDurationLabel } from '../../utils/messageUtils';
import { getUserDisplayName } from '../../utils/userUtils';

export interface CallMessageBodyProps {
  message: ChatMessage;
  peer: User | null;
  isSentByCurrentUser?: boolean;
  canCallBack: boolean;
  onCallBack: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
}

export default function CallMessageBody({
  message,
  peer,
  isSentByCurrentUser = false,
  canCallBack,
  onCallBack,
  onDeleteForMe,
}: CallMessageBodyProps) {
  const isVideoCall = message.callType === 'VIDEO';
  const typeLabel = isVideoCall ? 'Video' : 'Audio';
  const isCaller = Boolean(isSentByCurrentUser);
  const status = message.callStatus ?? 'ENDED';

  // Determine call scenario: missed (receiver), outgoing unanswered, ended, declined, busy
  const isMissed = !isCaller && (status === 'MISSED' || status === 'CANCELED' || status === 'BUSY');
  const isCompleted = status === 'ENDED';
  const durationLabel = isCompleted ? formatCallDurationLabel(message.callDurationSeconds) : '';
  const timeFormatted = formatMessageTime(message.timestamp);

  let title = '';
  let meta = '';
  let variantClass = '';

  if (isCompleted) {
    title = isCaller ? `Outgoing ${typeLabel.toLowerCase()} call` : `Incoming ${typeLabel.toLowerCase()} call`;
    meta = durationLabel ? `${durationLabel} · ${timeFormatted}` : timeFormatted;
    variantClass = isCaller ? 'is-outgoing is-completed' : 'is-incoming is-completed';
  } else if (isMissed) {
    title = `Missed ${typeLabel.toLowerCase()} call`;
    if (status === 'BUSY') {
      meta = `Line busy · ${timeFormatted}`;
      variantClass = 'is-incoming is-missed is-busy';
    } else {
      meta = `Tap to call back · ${timeFormatted}`;
      variantClass = 'is-incoming is-missed';
    }
  } else if (isCaller) {
    title = `Outgoing ${typeLabel.toLowerCase()} call`;
    if (status === 'CANCELED') {
      meta = `Canceled · ${timeFormatted}`;
      variantClass = 'is-outgoing is-unanswered is-canceled';
    } else if (status === 'REJECTED') {
      meta = `Declined · ${timeFormatted}`;
      variantClass = 'is-outgoing is-declined';
    } else if (status === 'BUSY') {
      meta = `Line busy · ${timeFormatted}`;
      variantClass = 'is-outgoing is-busy';
    } else {
      meta = `No answer · ${timeFormatted}`;
      variantClass = 'is-outgoing is-unanswered';
    }
  } else if (status === 'REJECTED') {
    title = `Incoming ${typeLabel.toLowerCase()} call`;
    meta = `Declined · ${timeFormatted}`;
    variantClass = 'is-incoming is-declined';
  } else {
    title = `${typeLabel} call`;
    meta = timeFormatted;
    variantClass = isCaller ? 'is-outgoing' : 'is-incoming';
  }

  // Choose icon based on scenario
  let mainIcon: React.ReactNode;
  if (isMissed) {
    mainIcon = <PhoneMissedIcon className="call-card-icon" />;
  } else if (isVideoCall) {
    mainIcon = <VideoCallIcon className="call-card-icon" />;
  } else if (isCaller) {
    mainIcon = <PhoneOutgoingIcon className="call-card-icon" />;
  } else {
    mainIcon = <PhoneIncomingIcon className="call-card-icon" />;
  }

  const actionLabel = isMissed || !isCaller ? 'Call back' : 'Call again';
  const callbackAriaLabel = peer
    ? `${actionLabel} (${getUserDisplayName(peer)})`
    : `${actionLabel}`;

  return (
    <div className={`call-message-card ${variantClass}`}>
      <div className="call-card-main">
        <div className="call-card-icon-wrap" aria-hidden="true">
          {mainIcon}
        </div>
        <div className="call-card-info">
          <span className="call-card-title">{title}</span>
          <span className="call-card-meta">{meta}</span>
        </div>
        {message.id > 0 ? (
          <button
            type="button"
            className="call-card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteForMe(message);
            }}
            aria-label="Delete call for me"
            title="Delete for me"
          >
            <TrashIcon className="call-card-delete-icon" />
          </button>
        ) : null}
      </div>

      {canCallBack && peer ? (
        <div className="call-card-actions">
          <button
            type="button"
            className="call-card-callback-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCallBack(message);
            }}
            aria-label={callbackAriaLabel}
            title={callbackAriaLabel}
          >
            <span className="call-card-callback-icon" aria-hidden="true">
              {isVideoCall ? <VideoCallIcon className="call-card-callback-icon" /> : <PhoneIcon className="call-card-callback-icon" />}
            </span>
            <span>{actionLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
