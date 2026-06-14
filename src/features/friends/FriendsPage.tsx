import { useState } from "react";
import { AddFriendModal } from "./AddFriendModal";
import { FriendAvatar } from "./FriendAvatar";
import { useFriends, useRemoveFriend } from "./hooks";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function FriendsPage() {
  const friends = useFriends();
  const removeFriend = useRemoveFriend();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const list = friends.data ?? [];
  const isEmpty = !friends.isLoading && list.length === 0;

  return (
    <div className="friends-page">
      <header className="ui-page-header">
        <div>
          <h1 className="ui-page-header__title">Friends</h1>
          <p className="ui-page-header__subtitle">Share goals and cheer each other on.</p>
        </div>
        <div className="ui-page-header__actions">
          <button type="button" className="task-add" onClick={() => setShowAdd(true)}>
            <span aria-hidden="true">+</span>
            Add friend
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div className="ui-empty friends-empty">
          <h2 className="ui-empty__title">No friends yet</h2>
          <p className="ui-empty__text">
            Add a friend with an invite link to start sharing goals together.
          </p>
          <button type="button" className="task-add" onClick={() => setShowAdd(true)}>
            <span aria-hidden="true">+</span>
            Add friend
          </button>
        </div>
      ) : (
        <ul className="friends-list">
          {list.map((friend) => (
            <li key={friend.id} className="friends-row ui-card ui-card--soft">
              <FriendAvatar
                name={friend.name}
                avatarId={friend.avatarId}
                avatarImage={friend.avatarImage}
                size="md"
              />
              <span className="friends-row__name">{friend.name}</span>

              {confirmingId === friend.id ? (
                <span className="friends-row__confirm">
                  <span className="friends-row__confirm-text">Remove {firstName(friend.name)}?</span>
                  <button
                    type="button"
                    className="goal-ghost-button goal-ghost-button--danger"
                    onClick={() => {
                      removeFriend.mutate(friend.id);
                      setConfirmingId(null);
                    }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="pomodoro-btn pomodoro-btn--ghost-text"
                    onClick={() => setConfirmingId(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger friends-row__remove"
                  aria-label={`Remove ${friend.name}`}
                  onClick={() => setConfirmingId(friend.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M6 7h12M9.5 7V5.5h5V7M8 7l.7 11.2a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L17 7" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showAdd ? <AddFriendModal onClose={() => setShowAdd(false)} /> : null}
    </div>
  );
}
