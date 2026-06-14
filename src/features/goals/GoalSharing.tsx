import { useEffect, useRef, useState } from "react";
import type { Goal, GoalActor } from "../../../shared/schemas";
import { FriendAvatar } from "../friends/FriendAvatar";
import { useFriends } from "../friends/hooks";
import {
  useAcceptGoalRequest,
  useDeclineGoalRequest,
  useGoalRequests,
  useShareGoal,
} from "./useGoals";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6.5" cy="12" r="2.2" />
      <circle cx="17" cy="6.5" r="2.2" />
      <circle cx="17" cy="17.5" r="2.2" />
      <path d="M8.5 11 15 7.5M8.5 13 15 16.5" />
    </svg>
  );
}

// Incoming goal-share invites — the "запросы на цели" surface in the Goals list.
export function GoalRequestsSection() {
  const requests = useGoalRequests();
  const accept = useAcceptGoalRequest();
  const decline = useDeclineGoalRequest();
  const list = requests.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="goal-requests" aria-label="Shared goal invites">
      <h2 className="goal-requests__title">Shared with you</h2>
      <ul className="goal-requests__list">
        {list.map((req) => (
          <li key={req.goalId} className="goal-request ui-card ui-card--soft">
            <FriendAvatar
              name={req.owner.name}
              avatarId={req.owner.avatarId}
              avatarImage={req.owner.avatarImage}
              size="md"
            />
            <div className="goal-request__copy">
              <strong>{req.title}</strong>
              <small>
                {firstName(req.owner.name)} invited you · {req.taskCount}{" "}
                {req.taskCount === 1 ? "task" : "tasks"}
              </small>
            </div>
            <div className="goal-request__actions">
              <button
                type="button"
                className="task-add"
                onClick={() => accept.mutate(req.goalId)}
                disabled={accept.isPending}
              >
                Accept
              </button>
              <button
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={() => decline.mutate(req.goalId)}
                disabled={decline.isPending}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Avatar stack of everyone active in a shared goal (owner + accepted members).
export function GoalMembersBar({ goal }: { goal: Goal }) {
  const members = (goal.members ?? []).filter((m) => m.status === "accepted");
  if ((goal.shareMode ?? "personal") !== "pool" || members.length <= 1) return null;
  return (
    <div className="goal-members" aria-label="Members">
      {members.map((m) => (
        <span
          key={m.id}
          className="goal-members__avatar"
          title={m.role === "owner" ? `${m.name} (owner)` : m.name}
        >
          <FriendAvatar name={m.name} avatarId={m.avatarId} avatarImage={m.avatarImage} size="sm" />
        </span>
      ))}
    </div>
  );
}

// Owner-only "Share" button + friend picker popover.
export function ShareGoalControl({ goal }: { goal: Goal }) {
  const friends = useFriends();
  const share = useShareGoal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const statusByMember = new Map((goal.members ?? []).map((m) => [m.id, m.status]));
  const list = friends.data ?? [];

  return (
    <div className="goal-share" ref={ref}>
      <button
        type="button"
        className="task-action task-action--edit goal-action-icon goal-share__trigger"
        aria-label="Share goal"
        title="Share goal"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ShareIcon />
      </button>
      {open ? (
        <div className="goal-share__popover ui-card ui-card--elevated" role="dialog" aria-label="Share goal">
          <p className="goal-share__heading">Share this goal</p>
          {list.length === 0 ? (
            <p className="goal-share__empty">Add friends first, then share goals with them.</p>
          ) : (
            <ul className="goal-share__friends">
              {list.map((friend) => {
                const status = statusByMember.get(friend.id);
                return (
                  <li key={friend.id} className="goal-share__friend">
                    <FriendAvatar
                      name={friend.name}
                      avatarId={friend.avatarId}
                      avatarImage={friend.avatarImage}
                      size="sm"
                    />
                    <span className="goal-share__friend-name">{friend.name}</span>
                    {status === "accepted" ? (
                      <span className="ui-badge ui-badge--success ui-badge--sm">Shared</span>
                    ) : status === "pending" ? (
                      <span className="ui-badge ui-badge--muted ui-badge--sm">Invited</span>
                    ) : (
                      <button
                        type="button"
                        className="task-add goal-share__add"
                        disabled={share.isPending}
                        onClick={() => share.mutate({ goalId: goal.id, friendId: friend.id })}
                      >
                        Share
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// "✓ by Anna" chip shown on completed shared-goal tasks/subtasks.
export function CompletedByTag({ actor }: { actor?: GoalActor | null }) {
  if (!actor) return null;
  return (
    <span className="goal-completed-by" title={`Completed by ${actor.name}`}>
      <FriendAvatar name={actor.name} avatarId={actor.avatarId} avatarImage={actor.avatarImage} size="sm" />
      <span>by {firstName(actor.name)}</span>
    </span>
  );
}
