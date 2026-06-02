import { useState } from "react";
import { motion } from "motion/react";
import { ApiError } from "../../shared/api/client";
import { useUpdateAvatar } from "../auth/useCurrentUser";

export function CharacterOnboarding({ initialAvatarId }: { initialAvatarId: string }) {
  const updateAvatar = useUpdateAvatar();
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      await updateAvatar.mutateAsync(selectedAvatarId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.payload?.errors?.avatarId ?? err.payload?.message ?? "Could not save your character.");
      } else {
        setError("Could not reach the auth server.");
      }
    }
  };

  return (
    <motion.div
      className="character-onboarding"
      initial={{ opacity: 0, filter: "blur(10px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="character-onboarding__kicker">Choose your companion</p>
      <h2 className="character-onboarding__title">Who will join your quests?</h2>
      <div className="character-onboarding__options" role="radiogroup" aria-label="Choose character">
        {["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"].map((avatarId, index) => (
          <button
            className={`character-onboarding__option ${selectedAvatarId === avatarId ? "is-selected" : ""}`.trim()}
            type="button"
            role="radio"
            aria-checked={selectedAvatarId === avatarId}
            aria-label={`Character ${index + 1}`}
            onClick={() => setSelectedAvatarId(avatarId)}
            key={avatarId}
          >
            <img src={`/avatars/${avatarId}.png`} alt="" aria-hidden="true" onError={(event) => (event.currentTarget.hidden = true)} />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p className="character-onboarding__error" role="status">
          {error}
        </p>
      ) : null}
      <button
        className="soft-button character-onboarding__confirm"
        type="button"
        disabled={updateAvatar.isPending}
        onClick={confirm}
      >
        {updateAvatar.isPending ? "Saving" : "Confirm"}
      </button>
    </motion.div>
  );
}
