import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { CATEGORY_PALETTE, type CategoryColor } from "../../../shared/categoryPalette";
import { MAX_CATEGORY_LENGTH } from "../../../shared/constants";
import { COUNTRY_REGION_CODES } from "../../shared/countryRegions";
import type { CategoryInfo } from "../../../shared/schemas";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";
import { useCurrentUser, useUpdateAvatarImage, useUpdateProfile } from "../auth/useCurrentUser";
import { useDeleteTaskCategory, useTaskCategories, useUpdateTaskCategory } from "../today/useTasks";

type SectionId = "profile" | "tasks" | "notifications";

const SECTIONS: Array<{ id: SectionId; label: string; disabled?: boolean }> = [
  { id: "profile", label: "Profile" },
  { id: "tasks", label: "Tasks" },
  { id: "notifications", label: "Notifications", disabled: true },
];

type CountryRegionOption = {
  code: string;
  label: string;
};

function countryRegionOptions(): CountryRegionOption[] {
  const displayNamesCtor = (Intl as unknown as {
    DisplayNames?: new (locales: string[], options: { type: "region" }) => { of: (code: string) => string | undefined };
  }).DisplayNames;
  const locales = typeof navigator === "undefined" ? ["en"] : [navigator.language, "en"].filter(Boolean);
  const displayNames = displayNamesCtor ? new displayNamesCtor(locales, { type: "region" }) : null;

  return COUNTRY_REGION_CODES.map((code) => ({
    code,
    label: displayNames?.of(code) ?? code,
  })).sort((first, second) => first.label.localeCompare(second.label));
}

function SectionIcon({ id }: { id: SectionId }) {
  if (id === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8.2" r="3.4" />
        <path d="M5.4 19c0-3.4 3-5.6 6.6-5.6s6.6 2.2 6.6 5.6" />
      </svg>
    );
  }
  if (id === "tasks") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 7.5h9M10 12h9M10 16.5h9" />
        <path d="m4.6 6.6 1 1 1.8-2M4.6 11.1l1 1 1.8-2M4.6 15.6l1 1 1.8-2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.2c-2.8 0-4.7 2.1-4.7 4.9 0 4.1-1.4 5.5-1.9 6-.3.3-.1.9.4.9h12.4c.5 0 .7-.6.4-.9-.5-.5-1.9-1.9-1.9-6 0-2.8-1.9-4.9-4.7-4.9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function categoryStyle(color: CategoryColor): CSSProperties {
  return { "--category-color": color } as CSSProperties;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function CountryRegionCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => countryRegionOptions(), []);
  const query = value.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!query) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(query) || option.code.toLowerCase().includes(query),
    );
  }, [options, query]);
  const visibleOptions = filteredOptions;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (option: CountryRegionOption) => {
    onChange(option.label);
    setOpen(false);
  };

  return (
    <div className="settings-country-picker" ref={rootRef}>
      <input
        className="ui-field__control settings-country-picker__input"
        value={value}
        maxLength={80}
        placeholder="Country / Region"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-label="Country or region"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
          if (event.key === "Enter" && visibleOptions[0]) {
            event.preventDefault();
            choose(visibleOptions[0]);
          }
        }}
      />
      <span className="task-modal__dropdown-caret settings-country-picker__caret" aria-hidden="true" />
      <div className="settings-country-picker__dropdown" data-open={open ? "true" : "false"}>
        <ul className="settings-country-picker__list app-scroll" role="listbox" aria-label="Country or region options">
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  <small>{option.code}</small>
                </button>
              </li>
            ))
          ) : (
            <li className="settings-country-picker__empty">No matches</li>
          )}
        </ul>
      </div>
    </div>
  );
}

const AVATAR_IMAGE_SIZE = 512;
const AVATAR_CROP_PREVIEW_SIZE = 240;

type AvatarPhotoDraft = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
};

type AvatarCropOffset = {
  x: number;
  y: number;
};

function loadImageSource(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this photo."));
    image.src = src;
  });
}

function readAvatarPhotoFile(file: File) {
  return new Promise<AvatarPhotoDraft>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        reject(new Error("Could not read this photo."));
        return;
      }

      try {
        const image = await loadImageSource(src);
        resolve({ src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(file);
  });
}

function getAvatarBaseScale(photo: AvatarPhotoDraft) {
  return AVATAR_CROP_PREVIEW_SIZE / Math.min(photo.naturalWidth, photo.naturalHeight);
}

function getAvatarContainScale(photo: AvatarPhotoDraft) {
  return Math.min(photo.naturalWidth, photo.naturalHeight) / Math.max(photo.naturalWidth, photo.naturalHeight);
}

function clampAvatarOffset(photo: AvatarPhotoDraft, scale: number, offset: AvatarCropOffset): AvatarCropOffset {
  const baseScale = getAvatarBaseScale(photo);
  const displayWidth = photo.naturalWidth * baseScale * scale;
  const displayHeight = photo.naturalHeight * baseScale * scale;
  const maxX = Math.max(0, (displayWidth - AVATAR_CROP_PREVIEW_SIZE) / 2);
  const maxY = Math.max(0, (displayHeight - AVATAR_CROP_PREVIEW_SIZE) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

async function renderAvatarCrop(photo: AvatarPhotoDraft, scale: number, offset: AvatarCropOffset) {
  const image = await loadImageSource(photo.src);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_IMAGE_SIZE;
  canvas.height = AVATAR_IMAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare this photo.");

  const ratio = AVATAR_IMAGE_SIZE / AVATAR_CROP_PREVIEW_SIZE;
  const baseScale = getAvatarBaseScale(photo);
  const drawWidth = photo.naturalWidth * baseScale * scale * ratio;
  const drawHeight = photo.naturalHeight * baseScale * scale * ratio;
  const drawX = (AVATAR_IMAGE_SIZE - drawWidth) / 2 + offset.x * ratio;
  const drawY = (AVATAR_IMAGE_SIZE - drawHeight) / 2 + offset.y * ratio;

  context.clearRect(0, 0, AVATAR_IMAGE_SIZE, AVATAR_IMAGE_SIZE);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas.toDataURL("image/webp", 0.9);
}

function categoryNameInputWidth(value: string) {
  return `${Math.max(4, Math.min(MAX_CATEGORY_LENGTH, value.length + 1))}ch`;
}

function AvatarCropModal({
  photo,
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  photo: AvatarPhotoDraft;
  error: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (avatarImage: string) => Promise<void>;
}) {
  const minScale = useMemo(() => getAvatarContainScale(photo), [photo]);
  const [scale, setScale] = useState(minScale);
  const [offset, setOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [localError, setLocalError] = useState("");
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const baseScale = useMemo(() => getAvatarBaseScale(photo), [photo]);
  const imageWidth = photo.naturalWidth * baseScale;
  const imageHeight = photo.naturalHeight * baseScale;

  function updateScale(nextScale: number) {
    setScale(nextScale);
    setOffset((current) => clampAvatarOffset(photo, nextScale, current));
  }

  async function saveCrop() {
    setLocalError("");
    try {
      const avatarImage = await renderAvatarCrop(photo, scale, offset);
      await onSave(avatarImage);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  return (
    <div className="ui-modal-overlay" role="presentation">
      <section
        className="ui-modal ui-modal--form settings-avatar-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-avatar-crop-title"
      >
        <header className="ui-modal__header settings-avatar-crop-modal__header">
          <h2 id="settings-avatar-crop-title" className="ui-modal__title">
            Adjust photo
          </h2>
        </header>

        <div className="ui-modal__body settings-avatar-crop-modal__body">
          <div
            className="settings-avatar-crop-modal__viewport"
            onPointerDown={(event) => {
              if (isSaving) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: offset.x,
                originY: offset.y,
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setOffset(
                clampAvatarOffset(photo, scale, {
                  x: drag.originX + event.clientX - drag.startX,
                  y: drag.originY + event.clientY - drag.startY,
                }),
              );
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
            }}
          >
            <img
              src={photo.src}
              alt=""
              draggable={false}
              className="settings-avatar-crop-modal__image"
              style={{
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          </div>

          <label className="settings-avatar-crop-modal__scale">
            <span>Scale</span>
            <input
              type="range"
              min={minScale}
              max="5"
              step="0.01"
              value={scale}
              disabled={isSaving}
              onChange={(event) => updateScale(Number(event.target.value))}
            />
          </label>

          {localError || error ? <p className="ui-field__error">{localError || error}</p> : null}
        </div>

        <footer className="ui-modal__footer settings-avatar-crop-modal__footer">
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text settings-avatar-crop-modal__cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="task-add settings-avatar-crop-modal__save"
            disabled={isSaving}
            onClick={() => void saveCrop()}
          >
            {isSaving ? "Saving..." : "Save photo"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ProfileSettings() {
  const currentUser = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const updateAvatarImage = useUpdateAvatarImage();
  const user = currentUser.data;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoDraft, setPhotoDraft] = useState<AvatarPhotoDraft | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setBirthDate(user?.birthDate ?? "");
    setCountry(user?.country ?? "");
    setError("");
    setPhotoPreview("");
    setPhotoError("");
    setPhotoDraft(null);
  }, [user?.avatarImage, user?.birthDate, user?.country, user?.email, user?.name]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedCountry = country.trim();
  const userName = user?.name ?? "";
  const userEmail = user?.email ?? "";
  const userBirthDate = user?.birthDate ?? "";
  const userCountry = user?.country ?? "";
  const isGoogleAccount = Boolean(user?.isGoogleAccount);
  const isDirty =
    Boolean(user) &&
    (trimmedName !== userName || (!isGoogleAccount && trimmedEmail !== userEmail) || birthDate !== userBirthDate || trimmedCountry !== userCountry);
  const canSave =
    Boolean(user) &&
    trimmedName.length > 0 &&
    (isGoogleAccount || trimmedEmail.length > 0) &&
    isDirty &&
    !updateProfile.isPending;

  async function saveProfile() {
    if (!canSave) return;
    setError("");
    try {
      await updateProfile.mutateAsync({
        name: trimmedName,
        email: isGoogleAccount ? userEmail : trimmedEmail,
        birthDate,
        country: trimmedCountry,
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function openAvatarPhotoCrop(file: File) {
    setPhotoError("");
    try {
      const photo = await readAvatarPhotoFile(file);
      setPhotoDraft(photo);
    } catch (err) {
      setPhotoError(errorMessage(err));
    }
  }

  async function saveAvatarPhoto(avatarImage: string) {
    setPhotoError("");
    try {
      await updateAvatarImage.mutateAsync(avatarImage);
      setPhotoPreview("");
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError(errorMessage(err));
      throw err;
    }
  }

  async function deleteAvatarPhoto() {
    if (!user?.avatarImage) return;
    setPhotoError("");
    try {
      await updateAvatarImage.mutateAsync(null);
      setPhotoPreview("");
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError(errorMessage(err));
    }
  }

  const avatarImage = photoPreview || user?.avatarImage || "";
  const avatarLetter = trimmedName ? trimmedName.slice(0, 1).toUpperCase() : "?";

  return (
    <section className="settings-profile" aria-labelledby="settings-profile-title">
      <div className="settings-profile__layout">
        <section className="settings-profile__photo-card" aria-label="Profile photo">
          <button
            type="button"
            className="settings-profile__avatar"
            aria-label="Update profile photo"
            disabled={!user || updateAvatarImage.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {avatarImage ? (
              <img className="settings-profile__avatar-photo" src={avatarImage} alt="" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{avatarLetter}</span>
            )}
          </button>
          <strong className="settings-profile__photo-name">{trimmedName || user?.name || "Profile"}</strong>
          <span className="settings-profile__photo-email">{user?.email ?? ""}</span>
          <input
            ref={fileInputRef}
            className="settings-profile__photo-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void openAvatarPhotoCrop(file);
            }}
          />
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text settings-profile__photo-action"
            disabled={!user || updateAvatarImage.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {updateAvatarImage.isPending ? "Saving..." : "Update photo"}
          </button>
          {user?.avatarImage ? (
            <DeleteActionButton
              className="settings-profile__photo-delete"
              disabled={updateAvatarImage.isPending}
              onClick={() => void deleteAvatarPhoto()}
            >
              Delete photo
            </DeleteActionButton>
          ) : null}
          {photoError ? <p className="ui-field__error settings-profile__photo-error">{photoError}</p> : null}
        </section>

        <section className="settings-profile__details-card" aria-labelledby="settings-profile-details-title">
          <h3 id="settings-profile-details-title" className="settings-profile__section-title">
            Personal details
          </h3>

          <div className="settings-profile__form">
            <label className={`ui-field settings-profile__field ${error ? "is-invalid" : ""}`.trim()}>
              <span className="ui-field__label">Name</span>
              <input
                className="ui-field__control"
                value={name}
                maxLength={80}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError("");
                }}
              />
            </label>

            <label className={`ui-field settings-profile__field ${error ? "is-invalid" : ""}`.trim()}>
              <span className="ui-field__label">Email</span>
              <input
                className="ui-field__control"
                type="email"
                value={email}
                maxLength={160}
                disabled={isGoogleAccount}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError("");
                }}
              />
            </label>

            <label className="ui-field settings-profile__field">
              <span className="ui-field__label">Birth date</span>
              <input
                className="ui-field__control"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>

            <label className="ui-field settings-profile__field">
              <span className="ui-field__label">Country / Region</span>
              <CountryRegionCombobox value={country} onChange={setCountry} />
            </label>

            {error ? <p className="ui-field__error settings-profile__error">{error}</p> : null}

            <div className="settings-profile__actions">
              <button
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text settings-profile__cancel"
                disabled={!isDirty || updateProfile.isPending}
                onClick={() => {
                  setName(user?.name ?? "");
                  setEmail(user?.email ?? "");
                  setBirthDate(user?.birthDate ?? "");
                  setCountry(user?.country ?? "");
                  setError("");
                }}
              >
                Cancel
              </button>
              <button type="button" className="task-add settings-profile__save" disabled={!canSave} onClick={saveProfile}>
                {updateProfile.isPending ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {photoDraft ? (
        <AvatarCropModal
          photo={photoDraft}
          error={photoError}
          isSaving={updateAvatarImage.isPending}
          onCancel={() => {
            setPhotoDraft(null);
            setPhotoError("");
          }}
          onSave={saveAvatarPhoto}
        />
      ) : null}

      <section className="settings-danger-zone" aria-labelledby="settings-danger-title">
        <div>
          <h3 id="settings-danger-title" className="settings-danger-zone__title">
            Danger zone
          </h3>
          <p className="settings-section__hint">Permanent account actions live here.</p>
        </div>
        <DeleteActionButton className="settings-danger-zone__delete" disabled>
          Delete Account
        </DeleteActionButton>
      </section>
    </section>
  );
}

function TaskCategoryRow({
  category,
  onDelete,
}: {
  category: CategoryInfo;
  onDelete: (category: CategoryInfo) => void;
}) {
  const updateCategory = useUpdateTaskCategory();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<CategoryColor>(category.color);
  const [error, setError] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPlacement, setColorPlacement] = useState<"down" | "up">("down");
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const colorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const colorPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setName(category.name);
    setColor(category.color);
    setError("");
    setColorOpen(false);
  }, [category.color, category.name]);

  useEffect(() => {
    if (!colorOpen) return undefined;

    function updateColorPlacement() {
      const trigger = colorTriggerRef.current;
      if (!trigger) return;

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const triggerRect = trigger.getBoundingClientRect();
      const gap = 8;
      const popoverHeight = colorPopoverRef.current?.offsetHeight ?? 160;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setColorPlacement(spaceBelow < popoverHeight + gap && spaceAbove > spaceBelow ? "up" : "down");
    }

    function closeOnOutsideClick(event: PointerEvent) {
      if (!colorMenuRef.current?.contains(event.target as Node)) setColorOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setColorOpen(false);
    }

    updateColorPlacement();
    const frameId = window.requestAnimationFrame(updateColorPlacement);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateColorPlacement);
    window.addEventListener("scroll", updateColorPlacement, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateColorPlacement);
      window.removeEventListener("scroll", updateColorPlacement, true);
    };
  }, [colorOpen]);

  const trimmedName = name.trim();
  const isDirty = trimmedName !== category.name || color !== category.color;
  const canSave = trimmedName.length > 0 && isDirty && !updateCategory.isPending;

  async function saveCategory() {
    if (!canSave) return;
    setError("");
    try {
      await updateCategory.mutateAsync({ name: category.name, nextName: trimmedName, color });
      setColorOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <article className="settings-category-row">
      <div className="settings-category-row__identity">
        <label
          className={`task-category settings-category-row__pill ${error ? "is-invalid" : ""}`.trim()}
          style={categoryStyle(color)}
        >
          <span className="sr-only">Category name</span>
          <input
            className="settings-category-row__pill-input"
            value={name}
            maxLength={MAX_CATEGORY_LENGTH}
            aria-invalid={Boolean(error)}
            placeholder="Category name"
            style={{ width: categoryNameInputWidth(name || category.name) }}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveCategory();
              }
            }}
          />
        </label>
      </div>

      <div className="settings-category-color-menu" ref={colorMenuRef}>
        <button
          type="button"
          className="settings-category-color-trigger"
          ref={colorTriggerRef}
          aria-expanded={colorOpen}
          aria-haspopup="listbox"
          onClick={() => setColorOpen((open) => !open)}
        >
          <span className="settings-category-color-trigger__swatch" style={categoryStyle(color)} aria-hidden="true" />
          <span>Color</span>
          <span className="settings-category-color-trigger__chevron" aria-hidden="true">
            ˅
          </span>
        </button>

        {colorOpen ? (
          <div
            className={`settings-category-color-popover settings-category-color-popover--${colorPlacement}`.trim()}
            ref={colorPopoverRef}
            role="listbox"
            aria-label={`Color for ${category.name}`}
          >
            {CATEGORY_PALETTE.map((item) => (
              <button
                key={item.color}
                type="button"
                role="option"
                className={`settings-category-color-option ${color === item.color ? "is-selected" : ""}`.trim()}
                style={categoryStyle(item.color)}
                aria-label={item.name}
                aria-selected={color === item.color}
                onClick={() => {
                  setColor(item.color);
                  setColorOpen(false);
                  if (error) setError("");
                }}
              >
                <span className="settings-category-color-option__swatch" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="settings-category-row__actions">
        <button
          type="button"
          className="pomodoro-btn pomodoro-btn--ghost-text settings-category-row__cancel"
          disabled={!isDirty || updateCategory.isPending}
          onClick={() => {
            setName(category.name);
            setColor(category.color);
            setColorOpen(false);
            setError("");
          }}
        >
          Cancel
        </button>
        <button type="button" className="task-add settings-category-row__save" disabled={!canSave} onClick={saveCategory}>
          Save
        </button>
        <DeleteActionButton className="settings-category-row__delete" onClick={() => onDelete(category)}>
          Delete category
        </DeleteActionButton>
      </div>

      {error ? <p className="ui-field__error settings-category-row__error">{error}</p> : null}
    </article>
  );
}

function TaskCategoryDeleteModal({
  category,
  onClose,
}: {
  category: CategoryInfo;
  onClose: () => void;
}) {
  const deleteCategory = useDeleteTaskCategory();
  const [error, setError] = useState("");

  async function removeCategory(mode: "detach" | "delete-tasks") {
    setError("");
    try {
      await deleteCategory.mutateAsync({ name: category.name, mode });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="ui-modal-overlay" role="presentation">
      <section
        className="ui-modal ui-modal--confirmation settings-category-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-category-delete-title"
      >
        <header className="ui-modal__header">
          <h2 id="task-category-delete-title" className="ui-modal__title">
            Delete category
          </h2>
          <p className="ui-modal__description">
            Choose what should happen to tasks linked to <strong>{category.name}</strong>.
          </p>
        </header>

        {error ? <p className="ui-field__error settings-category-delete-modal__error">{error}</p> : null}

        <footer className="ui-modal__footer settings-category-delete-modal__footer">
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text settings-category-delete-modal__cancel"
            disabled={deleteCategory.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="task-add settings-category-delete-modal__detach"
            disabled={deleteCategory.isPending}
            onClick={() => void removeCategory("detach")}
          >
            Unlink tasks
          </button>
          <DeleteActionButton
            className="settings-category-delete-modal__delete"
            disabled={deleteCategory.isPending}
            onClick={() => void removeCategory("delete-tasks")}
          >
            Delete tasks
          </DeleteActionButton>
        </footer>
      </section>
    </div>
  );
}

function TaskCategorySettings() {
  const categories = useTaskCategories();
  const [deleteTarget, setDeleteTarget] = useState<CategoryInfo | null>(null);
  const sortedCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categories.data],
  );

  return (
    <section className="settings-task-categories" aria-labelledby="task-categories-title">
      <div className="settings-subsection__header">
        <h3 id="task-categories-title" className="settings-subsection__title">
          Task categories
        </h3>
        <p className="settings-section__hint">
          Rename categories, tune their color, or remove them from your task flow.
        </p>
      </div>

      {categories.isLoading ? <p className="settings-section__hint">Loading categories...</p> : null}
      {categories.isError ? <p className="ui-field__error">{errorMessage(categories.error)}</p> : null}
      {!categories.isLoading && !categories.isError && sortedCategories.length === 0 ? (
        <div className="ui-empty settings-task-categories__empty">No task categories yet.</div>
      ) : null}

      {sortedCategories.length > 0 ? (
        <div className="settings-task-categories__list">
          {sortedCategories.map((category) => (
            <TaskCategoryRow key={category.name} category={category} onDelete={setDeleteTarget} />
          ))}
        </div>
      ) : null}

      {deleteTarget ? (
        <TaskCategoryDeleteModal category={deleteTarget} onClose={() => setDeleteTarget(null)} />
      ) : null}
    </section>
  );
}

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>("profile");

  return (
    <motion.section
      className="settings-page"
      aria-label="Settings"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="settings-page__header">
        <h1 className="tasks-title">Settings</h1>
        <p className="goals-page__subtitle">Manage your account and app preferences.</p>
      </header>

      <div className="settings-layout ui-card ui-card--elevated">
        <nav className="settings-menu" aria-label="Settings sections">
          {SECTIONS.map((section) => {
            const isActive = active === section.id;
            return (
              <button
                key={section.id}
                type="button"
                disabled={section.disabled}
                aria-current={isActive ? "page" : undefined}
                className={`settings-menu__item ${isActive ? "is-active" : ""} ${section.disabled ? "is-disabled" : ""}`
                  .replace(/\s+/g, " ")
                  .trim()}
                onClick={() => {
                  if (!section.disabled) setActive(section.id);
                }}
              >
                <span className="settings-menu__icon">
                  <SectionIcon id={section.id} />
                </span>
                <span className="settings-menu__label">{section.label}</span>
                {section.disabled ? <span className="settings-menu__soon">Soon</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {active === "profile" ? (
            <div className="settings-section">
              <h2 className="settings-section__title">Profile</h2>
              <p className="settings-section__hint">Manage your personal details.</p>
              <ProfileSettings />
            </div>
          ) : null}

          {active === "tasks" ? (
            <div className="settings-section">
              <h2 className="settings-section__title">Tasks</h2>
              <p className="settings-section__hint">Manage task preferences and category details.</p>
              <TaskCategorySettings />
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
