import { useState } from "react";

export function Avatar({ avatarId, name }: { avatarId: string; name: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <span className="avatar-preview">
      {!hasImageError ? (
        <img
          src={`/avatars/${avatarId}.png`}
          alt=""
          aria-hidden="true"
          onError={() => setHasImageError(true)}
        />
      ) : null}
      {hasImageError ? <span>{name.slice(0, 1).toUpperCase()}</span> : null}
    </span>
  );
}

export function Character({ avatarId }: { avatarId: string }) {
  return (
    <div className="character-preview">
      <img
        src={`/avatars/${avatarId}.png`}
        alt=""
        onError={(event) => (event.currentTarget.hidden = true)}
      />
    </div>
  );
}
