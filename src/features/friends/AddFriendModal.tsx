import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api/client";
import { inviteUrl } from "./api";
import { useMyInvite, useRedeemInvite, useRegenerateInvite } from "./hooks";

// Pull the bare code out of whatever the user pasted: a full invite link, or
// just the code on its own.
function parseCode(raw: string): string {
  const trimmed = raw.trim();
  const marker = "/invite/";
  const at = trimmed.indexOf(marker);
  if (at >= 0) {
    return trimmed.slice(at + marker.length).split(/[/?#]/)[0] ?? "";
  }
  return trimmed;
}

export function AddFriendModal({ onClose }: { onClose: () => void }) {
  const invite = useMyInvite();
  const regenerate = useRegenerateInvite();
  const redeem = useRedeemInvite();

  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    };
  }, []);

  const url = invite.data ? inviteUrl(invite.data.code) : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  };

  const handleAdd = async () => {
    const code = parseCode(codeInput);
    if (!code) {
      setError("Paste a friend's invite link or code.");
      return;
    }
    setError(null);
    setAddedName(null);
    try {
      const { friend } = await redeem.mutateAsync(code);
      setAddedName(friend.name);
      setCodeInput("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add this friend. Check the code and try again.");
    }
  };

  return (
    <div className="ui-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--form friends-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add a friend"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-modal__header">
          <h2 className="ui-modal__title">Add a friend</h2>
          <p className="ui-modal__description">
            Share your invite link, or paste a friend's link to connect.
          </p>
        </div>

        <div className="ui-modal__body">
          <section className="friends-modal__section">
            <span className="ui-field__label">Your invite link</span>
            <div className="friends-invite-row">
              <input
                className="ui-field__control friends-invite-row__input"
                value={url}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Your invite link"
              />
              <button type="button" className="task-add friends-invite-row__copy" onClick={handleCopy} disabled={!url}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              className="pomodoro-btn pomodoro-btn--ghost-text friends-modal__regen"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? "Generating…" : "Generate a new link"}
            </button>
            <p className="ui-field__helper">
              Anyone who opens this link becomes your friend. Generate a new one to disable the old link.
            </p>
          </section>

          <div className="friends-modal__divider" aria-hidden="true"><span>or</span></div>

          <section className="friends-modal__section">
            <span className="ui-field__label">Add by link or code</span>
            <div className="friends-invite-row">
              <input
                className="ui-field__control friends-invite-row__input"
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value);
                  setError(null);
                  setAddedName(null);
                }}
                placeholder="Paste a friend's invite link"
                aria-label="Friend's invite link or code"
              />
              <button
                type="button"
                className="task-add friends-invite-row__copy"
                onClick={handleAdd}
                disabled={redeem.isPending || !codeInput.trim()}
              >
                {redeem.isPending ? "Adding…" : "Add"}
              </button>
            </div>
            {error ? <p className="ui-field__error">{error}</p> : null}
            {addedName ? <p className="friends-modal__success">You're now friends with {addedName} 🎉</p> : null}
          </section>
        </div>

        <div className="ui-modal__footer">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
