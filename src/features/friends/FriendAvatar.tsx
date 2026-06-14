import { useState } from "react";

type FriendAvatarProps = {
  name: string;
  avatarId: string | null;
  avatarImage: string | null;
  size?: "sm" | "md" | "lg";
};

// One avatar renderer for friends + invite previews: uploaded photo first, then
// a preset avatar PNG, then a tinted initial as the final fallback.
export function FriendAvatar({ name, avatarId, avatarImage, size = "md" }: FriendAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const src = !imgFailed ? avatarImage ?? (avatarId ? `/avatars/${avatarId}.png` : null) : null;

  return (
    <span className={`friends-avatar friends-avatar--${size}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" onError={() => setImgFailed(true)} />
      ) : (
        <span className="friends-avatar__initial">{initial}</span>
      )}
    </span>
  );
}
