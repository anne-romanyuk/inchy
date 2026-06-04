import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmojiClickData, Theme as EmojiPickerTheme } from "emoji-picker-react";
import { motion } from "motion/react";
import { useBlocker } from "react-router-dom";
import type { Note } from "../../../shared/schemas";
import { MAX_CATEGORY_LENGTH, MAX_NOTE_TITLE_LENGTH } from "../../../shared/constants";
import { GoalDatePicker } from "../goals/GoalDatePicker";
import { categoryTone } from "../today/categoryColor";
import { useNotes, useSaveNotes } from "./useNotes";

const MAX_TITLE = MAX_NOTE_TITLE_LENGTH;
const CATEGORY_FILTER_ALL = "All categories";
const CATEGORY_FILTER_NONE = "__no_category__";
const NO_CATEGORY_LABEL = "No category";
const DATE_FILTER_ANY = "Any time";
const DATE_FILTER_LAST_30 = "Last 30 days";
const EmojiPicker = lazy(() => import("emoji-picker-react"));
const NOTE_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const NOTE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const NOTE_EDITOR_EMPTY_CHAR = "\u200B";
const NOTE_EDITOR_INDENT_HTML = `<div>${NOTE_EDITOR_EMPTY_CHAR}</div>`;
const NOTE_ALLOWED_INLINE_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "strike"]);
const NOTE_ALLOWED_BLOCK_TAGS = new Set(["div", "p", "br", "ul", "ol", "li"]);

type EditorFormat = "bold" | "italic" | "underline" | "unorderedList" | "orderedList";
type NotesDateFilter =
  | { mode: "any" }
  | { mode: "last30" }
  | { mode: "date"; value: string };
type PendingNotesAction =
  | { type: "select"; noteId: string }
  | { type: "new" }
  | { type: "close" }
  | { type: "route" }
  | null;

const EDITOR_FORMAT_COMMANDS: Record<EditorFormat, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  unorderedList: "insertUnorderedList",
  orderedList: "insertOrderedList",
};

const EDITOR_FORMAT_BUTTONS: Array<{
  format: EditorFormat;
  label: string;
  ariaLabel: string;
  iconName?: string;
  textClassName?: string;
}> = [
  { format: "bold", label: "B", ariaLabel: "Bold selected text", textClassName: "notes-format-icon--bold" },
  { format: "italic", label: "I", ariaLabel: "Italic selected text", textClassName: "notes-format-icon--italic" },
  { format: "underline", label: "U", ariaLabel: "Underline selected text", textClassName: "notes-format-icon--underline" },
  { format: "unorderedList", label: "Bullet list", ariaLabel: "Make bullet list", iconName: "BulletList" },
  { format: "orderedList", label: "Numbered list", ariaLabel: "Make numbered list", iconName: "NumberedList" },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHtmlLike(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function plainTextToEditorHtml(value: string): string {
  if (!value.replaceAll(NOTE_EDITOR_EMPTY_CHAR, "").trim()) return "";
  return value
    .split(/\r?\n/)
    .map((line) => `<div>${line.trim().length > 0 ? escapeHtml(line) : "<br>"}</div>`)
    .join("");
}

function sanitizeNoteHtml(value: string): string {
  if (!value.trim()) return "";
  if (typeof document === "undefined") return value;

  const template = document.createElement("template");
  template.innerHTML = value;

  const cleanNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = node.nodeValue?.replaceAll(NOTE_EDITOR_EMPTY_CHAR, "") ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    Array.from(element.childNodes).forEach(cleanNode);

    if (!NOTE_ALLOWED_INLINE_TAGS.has(tag) && !NOTE_ALLOWED_BLOCK_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
  };

  Array.from(template.content.childNodes).forEach(cleanNode);
  const html = template.innerHTML.trim();

  if (html === NOTE_EDITOR_INDENT_HTML || html === "<div></div>" || html === "<br>") return "";
  return html;
}

function noteBodyForEditor(value: string): string {
  if (!value.trim()) return NOTE_EDITOR_INDENT_HTML;
  return isHtmlLike(value) ? sanitizeNoteHtml(value) : plainTextToEditorHtml(value);
}

function noteBodyPlainText(value: string): string {
  if (!value.replaceAll(NOTE_EDITOR_EMPTY_CHAR, "").trim()) return "";
  if (typeof document === "undefined") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const container = document.createElement("div");
  container.innerHTML = noteBodyForEditor(value);
  return (container.innerText || container.textContent || "")
    .replaceAll(NOTE_EDITOR_EMPTY_CHAR, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isEditorHtmlEmpty(value: string): boolean {
  return noteBodyPlainText(value).length === 0;
}

function moveCaretToEnd(element: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCaretToEditorStart(element: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) return;

  const target = element.querySelector("div, p, li") ?? element;
  const range = document.createRange();
  const textNode = Array.from(target.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(target);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function rangeIsInsideElement(range: Range | null, element: HTMLElement): range is Range {
  if (!range) return false;
  return element.contains(range.commonAncestorContainer);
}

function makeId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function noteActivityTime(note: Note): number {
  const updated = Date.parse(note.updatedAt ?? "");
  const created = Date.parse(note.createdAt ?? "");
  const idTimestamp = Number(note.id.match(/^note-(\d+)-/)?.[1] ?? 0);
  return Math.max(
    Number.isFinite(updated) ? updated : 0,
    Number.isFinite(created) ? created : 0,
    Number.isFinite(idTimestamp) ? idTimestamp : 0,
  );
}

function formatNoteDate(note: Note): string {
  const time = noteActivityTime(note);
  return time > 0 ? NOTE_DATE_FORMAT.format(new Date(time)) : "";
}

function formatNoteTimestamp(date: Date): string {
  return `${NOTE_DATE_FORMAT.format(date)} • ${NOTE_TIME_FORMAT.format(date)}`;
}

function toNoteIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function noteIsoDate(note: Note): string {
  const time = noteActivityTime(note);
  return time > 0 ? toNoteIsoDate(new Date(time)) : "";
}

function formatNoteIsoDate(value: string): string {
  if (!value) return DATE_FILTER_ANY;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return Number.isNaN(date.getTime()) ? value : NOTE_DATE_FORMAT.format(date);
}

function noteDateFilterLabel(filter: NotesDateFilter): string {
  if (filter.mode === "any") return DATE_FILTER_ANY;
  if (filter.mode === "last30") return DATE_FILTER_LAST_30;
  return filter.value === toNoteIsoDate(new Date()) ? "Today" : formatNoteIsoDate(filter.value);
}

function noteCategory(note: Note): string {
  return (note.category ?? "").trim();
}

function noteCategoryLabel(category: string) {
  return category.trim() || NO_CATEGORY_LABEL;
}

function noteCategoryBadgeClass(category: string) {
  const value = category.trim();
  return value
    ? `task-category task-category--${categoryTone(value)} notes-category-badge`
    : "task-category notes-category-badge notes-category-badge--empty";
}

function noteIcon(category: string) {
  if (!category.trim()) return "Note";
  if (category === "Work") return "Briefcase";
  if (category === "Ideas") return "Lightbulb";
  if (category === "Health") return "Leaf";
  if (category === "Personal") return "Heart";
  return "Tag";
}

function noteExcerpt(note: Note) {
  // Empty body → no placeholder copy; the card keeps a blank line instead.
  const source = noteBodyPlainText(note.body).trim();
  if (!source) return "";
  return source.replace(/\s+/g, " ").slice(0, 86);
}

function isPinned(note: Note) {
  return note.pinned === true;
}

function Icon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "Search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m16.2 16.2 3.3 3.3" />
        </svg>
      );
    case "Tag":
      return (
        <svg {...common}>
          <path d="M20 13.2 13.2 20 4 10.8V4h6.8L20 13.2Z" />
          <circle cx="8.2" cy="8.2" r="1.2" />
        </svg>
      );
    case "Calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "Sliders":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
          <circle cx="8" cy="7" r="2" />
          <circle cx="16" cy="17" r="2" />
        </svg>
      );
    case "Note":
      return (
        <svg {...common}>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case "Archive":
      return (
        <svg {...common}>
          <path d="M4 7h16v4H4zM6 11v8h12v-8" />
          <path d="M10 15h4" />
        </svg>
      );
    case "Trash":
      return (
        <svg {...common}>
          <path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13" />
        </svg>
      );
    case "BulletList":
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="1" />
          <circle cx="6" cy="12" r="1" />
          <circle cx="6" cy="17" r="1" />
          <path d="M10 7h9M10 12h9M10 17h9" />
        </svg>
      );
    case "NumberedList":
      return (
        <svg {...common}>
          <path d="M5 6h1v4M5 10h2M5 14h2l-2 4h2M10 7h9M10 12h9M10 17h9" />
        </svg>
      );
    case "Smile":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 10h.01M15 10h.01M8.8 14.5c1.4 1.4 5 1.4 6.4 0" />
        </svg>
      );
    case "Heart":
      return (
        <svg {...common}>
          <path d="M20 8.8c0 5-8 9.2-8 9.2S4 13.8 4 8.8A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8 2.8Z" />
        </svg>
      );
    case "Briefcase":
      return (
        <svg {...common}>
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M9 8V6h6v2M4 13h16" />
        </svg>
      );
    case "Lightbulb":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4M8 10a4 4 0 1 1 8 0c0 2-1.2 3-2.2 4H10.2C9.2 13 8 12 8 10Z" />
        </svg>
      );
    case "Leaf":
      return (
        <svg {...common}>
          <path d="M5 19c10 0 14-8 14-14C9 5 5 9 5 19Z" />
          <path d="M5 19c3-5 7-8 12-10" />
        </svg>
      );
    case "Star":
      return (
        <svg {...common}>
          <path d="m12 4 2.3 4.8 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 4Z" />
        </svg>
      );
    case "More":
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="18" cy="12" r="1" />
        </svg>
      );
    case "Close":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "Fullscreen":
      return (
        <svg {...common}>
          <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
        </svg>
      );
    case "Minimize":
      return (
        <svg {...common}>
          <path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" />
        </svg>
      );
    case "Pin":
      return (
        <svg {...common}>
          <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
          <path d="M12 15v5" />
        </svg>
      );
    default:
      return null;
  }
}

export function NotesPage() {
  const notesQuery = useNotes();
  const saveNotes = useSaveNotes();

  const serverNotes = notesQuery.data;
  const [working, setWorking] = useState<Note[] | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(CATEGORY_FILTER_ALL);
  const [dateFilter, setDateFilter] = useState<NotesDateFilter>({ mode: "any" });
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingNotesAction>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Record<EditorFormat, boolean>>({
    bold: false,
    italic: false,
    underline: false,
    unorderedList: false,
    orderedList: false,
  });
  const noteTitleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const categoryFilterRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const savedEditorRangeRef = useRef<Range | null>(null);
  const lastEditorBodyRef = useRef("");
  const dirtyRef = useRef(false);
  const pendingActionRef = useRef<PendingNotesAction>(null);
  const activeIdRef = useRef(activeId);
  const persistRef = useRef<((next: Note[], preferredActiveId?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (serverNotes !== undefined && working === null) {
      // Start with no note open — the editor stays closed until the user opens
      // one from the list or creates a new note.
      setWorking(serverNotes);
    }
  }, [serverNotes, working]);

  const notes = working ?? [];
  const activeNote = useMemo(
    () => (activeId ? notes.find((n) => n.id === activeId) : undefined),
    [notes, activeId],
  );
  const activeCategory = activeNote ? noteCategory(activeNote) : "";

  // A brand-new note the user just created but never edited: it isn't in the DB
  // yet and has an empty title and body. These shouldn't count as unsaved work —
  // closing one needs no confirm and Save stays disabled until real content.
  const isBlankNewNote = useCallback(
    (note: Note | undefined): boolean => {
      if (!note) return false;
      if ((serverNotes ?? []).some((s) => s.id === note.id)) return false;
      return note.title.trim().length === 0 && noteBodyPlainText(note.body).length === 0;
    },
    [serverNotes],
  );

  // Dirty = there is something worth saving. Untouched brand-new notes are
  // ignored so an empty new note never enables Save or triggers a leave prompt.
  const dirty = useMemo(() => {
    if (working === null) return false;
    const meaningful = working.filter((note) => !isBlankNewNote(note));
    return JSON.stringify(meaningful) !== JSON.stringify(serverNotes ?? []);
  }, [working, serverNotes, isBlankNewNote]);
  dirtyRef.current = dirty;
  pendingActionRef.current = pendingAction;
  activeIdRef.current = activeId;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && pendingActionRef.current === null && dirtyRef.current,
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notes.forEach((note) => {
      const key = noteCategory(note);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [notes]);

  const noteCategoryOptions = useMemo(() => {
    const options = new Set<string>();
    notes.forEach((note) => {
      const value = noteCategory(note);
      if (value) options.add(value);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const navCategoryOptions = useMemo(() => {
    const options = [...noteCategoryOptions];
    return (categoryCounts.get("") ?? 0) > 0 ? ["", ...options] : options;
  }, [categoryCounts, noteCategoryOptions]);

  const categoryFilterOptions = useMemo(
    () => [CATEGORY_FILTER_ALL, ...navCategoryOptions],
    [navCategoryOptions],
  );

  const categoryDropdownOptions = useMemo(() => {
    const query = categoryDraft.trim().toLowerCase();
    if (!query) return noteCategoryOptions;
    return noteCategoryOptions.filter((option) => option.toLowerCase().includes(query));
  }, [categoryDraft, noteCategoryOptions]);

  const categoryDraftValue = categoryDraft.trim();
  const canCreateCategory =
    categoryDraftValue.length > 0 &&
    !noteCategoryOptions.some((option) => option.toLowerCase() === categoryDraftValue.toLowerCase());

  useEffect(() => {
    if (category === CATEGORY_FILTER_ALL) return;
    if (category === CATEGORY_FILTER_NONE) {
      if ((categoryCounts.get("") ?? 0) === 0) setCategory(CATEGORY_FILTER_ALL);
      return;
    }
    if (!noteCategoryOptions.includes(category)) setCategory(CATEGORY_FILTER_ALL);
  }, [category, categoryCounts, noteCategoryOptions]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const last30Cutoff = new Date();
    last30Cutoff.setHours(0, 0, 0, 0);
    last30Cutoff.setDate(last30Cutoff.getDate() - 29);
    return notes
      .filter((note) => {
        const noteText = noteBodyPlainText(note.body).toLowerCase();
        const noteTime = noteActivityTime(note);
        const noteDate = noteIsoDate(note);
        const matchesSearch =
          query.length === 0 ||
          note.title.toLowerCase().includes(query) ||
          noteText.includes(query);
        const matchesCategory =
          category === CATEGORY_FILTER_ALL ||
          (category === CATEGORY_FILTER_NONE ? noteCategory(note) === "" : noteCategory(note) === category);
        const matchesDate =
          dateFilter.mode === "any" ||
          (dateFilter.mode === "last30" && noteTime >= last30Cutoff.getTime()) ||
          (dateFilter.mode === "date" && noteDate === dateFilter.value);
        return matchesSearch && matchesCategory && matchesDate;
      })
      .sort(
        (a, b) =>
          Number(isPinned(b)) - Number(isPinned(a)) || noteActivityTime(b) - noteActivityTime(a),
      );
  }, [category, dateFilter, notes, search]);

  useEffect(() => {
    setCategoryMenuOpen(false);
    setCategoryDraft("");
    setEmojiPickerOpen(false);
    setDeleteTargetId(null);
  }, [activeNote?.id]);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    window.setTimeout(() => categoryInputRef.current?.focus(), 0);
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!activeNote) setEditorExpanded(false);
  }, [activeNote]);

  // Close an open card kebab menu on any outside click.
  useEffect(() => {
    if (!cardMenuId) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".notes-card-menu")) {
        setCardMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [cardMenuId]);

  useEffect(() => {
    if (!categoryFilterOpen && !categoryMenuOpen && !emojiPickerOpen) return;
    const onClickOut = (event: MouseEvent) => {
      if (categoryFilterRef.current && !categoryFilterRef.current.contains(event.target as Node)) {
        setCategoryFilterOpen(false);
      }
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [categoryFilterOpen, categoryMenuOpen, emojiPickerOpen]);

  const updateActive = useCallback((patch: Partial<Note>) =>
    setWorking((current) =>
      (current ?? []).map((n) =>
        n.id === activeNote?.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
      ),
    ), [activeNote?.id]);

  const chooseActiveCategory = useCallback((value: string) => {
    const normalized = value.trim().slice(0, MAX_CATEGORY_LENGTH);
    const nextCategory =
      noteCategoryOptions.find((option) => option.toLowerCase() === normalized.toLowerCase()) ?? normalized;
    updateActive({ category: nextCategory });
    setCategoryDraft("");
    setCategoryMenuOpen(false);
  }, [noteCategoryOptions, updateActive]);

  const rememberEditorSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = document.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const anchorNode = selection.anchorNode;
    if (!anchorNode || !editor.contains(anchorNode)) return;
    savedEditorRangeRef.current = range.cloneRange();
  }, []);

  const refreshEditorFormatState = useCallback(() => {
    rememberEditorSelection();
    const editor = editorRef.current;
    const selection = document.getSelection();
    const anchorNode = selection?.anchorNode;
    const hasEditorSelection = Boolean(editor && anchorNode && editor.contains(anchorNode));

    if (!hasEditorSelection && document.activeElement !== editor) return;

    setActiveFormats({
      bold: document.queryCommandState(EDITOR_FORMAT_COMMANDS.bold),
      italic: document.queryCommandState(EDITOR_FORMAT_COMMANDS.italic),
      underline: document.queryCommandState(EDITOR_FORMAT_COMMANDS.underline),
      unorderedList: document.queryCommandState(EDITOR_FORMAT_COMMANDS.unorderedList),
      orderedList: document.queryCommandState(EDITOR_FORMAT_COMMANDS.orderedList),
    });
  }, [rememberEditorSelection]);

  const handleEditorInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !activeNote) return;

    const rawHtml = editor.innerHTML;
    const cleanHtml = sanitizeNoteHtml(rawHtml);
    const nextBody = isEditorHtmlEmpty(cleanHtml) ? "" : cleanHtml;
    lastEditorBodyRef.current = nextBody;
    editor.dataset.empty = nextBody ? "false" : "true";

    if (rawHtml !== cleanHtml && document.activeElement === editor) {
      editor.innerHTML = nextBody ? cleanHtml : NOTE_EDITOR_INDENT_HTML;
      if (nextBody) {
        moveCaretToEnd(editor);
      } else {
        moveCaretToEditorStart(editor);
      }
    }

    updateActive({ body: nextBody });
    refreshEditorFormatState();
  }, [activeNote, refreshEditorFormatState, updateActive]);

  const runEditorCommand = useCallback((format: EditorFormat) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(EDITOR_FORMAT_COMMANDS[format], false);
    handleEditorInput();
    refreshEditorFormatState();
  }, [handleEditorInput, refreshEditorFormatState]);

  const insertEmoji = useCallback((emojiData: EmojiClickData) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = document.getSelection();
    const currentRange =
      selection && selection.rangeCount > 0 && selection.anchorNode && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    const range = rangeIsInsideElement(savedEditorRangeRef.current, editor)
      ? savedEditorRangeRef.current.cloneRange()
      : currentRange?.cloneRange();

    const insertionRange = range ?? document.createRange();
    if (!range) {
      insertionRange.selectNodeContents(editor);
      insertionRange.collapse(false);
    }

    insertionRange.deleteContents();
    const emojiNode = document.createTextNode(emojiData.emoji);
    insertionRange.insertNode(emojiNode);
    insertionRange.setStartAfter(emojiNode);
    insertionRange.collapse(true);

    editor.focus();
    const nextSelection = document.getSelection();
    nextSelection?.removeAllRanges();
    nextSelection?.addRange(insertionRange);
    savedEditorRangeRef.current = insertionRange.cloneRange();

    handleEditorInput();
    rememberEditorSelection();
    setEmojiPickerOpen(false);
  }, [handleEditorInput, rememberEditorSelection]);

  // Pin/unpin and delete from the card menu persist immediately (the editor is
  // closed by default, so these don't rely on the editor's Save button).
  const togglePinNote = useCallback((noteId: string) => {
    setCardMenuId(null);
    const next = (working ?? []).map((note) =>
      note.id === noteId ? { ...note, pinned: !note.pinned } : note,
    );
    void persistRef.current?.(next, activeIdRef.current);
  }, [working]);

  const confirmDeleteNote = useCallback(() => {
    if (!deleteTargetId) return;
    const next = (working ?? []).filter((note) => note.id !== deleteTargetId);
    // If the open note is the one being removed, close the editor.
    const preferred = deleteTargetId === activeIdRef.current ? "" : activeIdRef.current;
    setDeleteTargetId(null);
    void persistRef.current?.(next, preferred);
  }, [deleteTargetId, working]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeNote) return;

    const nextHtml = noteBodyForEditor(activeNote.body);
    const currentHtml = sanitizeNoteHtml(editor.innerHTML);
    const isCurrentEditorChange = document.activeElement === editor && activeNote.body === lastEditorBodyRef.current;

    if (!isCurrentEditorChange && currentHtml !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    editor.dataset.empty = isEditorHtmlEmpty(activeNote.body) ? "true" : "false";

    refreshEditorFormatState();
  }, [activeNote?.body, activeNote?.id, refreshEditorFormatState]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshEditorFormatState);
    return () => document.removeEventListener("selectionchange", refreshEditorFormatState);
  }, [refreshEditorFormatState]);

  useEffect(() => {
    if (blocker.state === "blocked" && pendingAction?.type !== "route") {
      setPendingAction({ type: "route" });
    }
  }, [blocker.state, pendingAction?.type]);

  const resetToServerNotes = useCallback(() => {
    const base = serverNotes ?? [];
    setWorking(base);
    if (!base.some((n) => n.id === activeId)) setActiveId("");
    return base;
  }, [activeId, serverNotes]);

  const createNewNote = useCallback(() => {
    const now = new Date().toISOString();
    const note: Note = {
      id: makeId(),
      title: "",
      body: "",
      category: "",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setWorking((current) => [...(current ?? []), note]);
    setActiveId(note.id);
    setSearch("");
    setDateFilter({ mode: "any" });
    window.setTimeout(() => noteTitleRef.current?.focus(), 0);
  }, []);

  const persist = useCallback(async (next: Note[], preferredActiveId = activeId) => {
    const result = await saveNotes.mutateAsync(
      // Never persist an untouched brand-new note.
      next
        .filter((n) => !isBlankNewNote(n))
        .map((n) => ({
          id: n.id,
          title: n.title,
          body: sanitizeNoteHtml(n.body),
          category: n.category?.trim() ?? "",
          pinned: n.pinned ?? false,
        })),
    );
    const saved = result.notes;
    setWorking(saved);
    // Keep the requested note open if it still exists, otherwise close the editor
    // (an empty preferred id intentionally means "no note open").
    setActiveId(saved.some((n) => n.id === preferredActiveId) ? preferredActiveId : "");
  }, [activeId, isBlankNewNote, saveNotes]);
  persistRef.current = persist;

  // Drop the currently-open note when it's an untouched brand-new note, so it
  // never lingers as an "Untitled" card after the user navigates away from it.
  const dropActiveIfBlank = useCallback(() => {
    setWorking((current) => {
      if (!current) return current;
      const id = activeIdRef.current;
      const note = current.find((n) => n.id === id);
      if (note && isBlankNewNote(note)) return current.filter((n) => n.id !== id);
      return current;
    });
  }, [isBlankNewNote]);

  const requestNotesAction = useCallback((action: Exclude<PendingNotesAction, null>) => {
    if (action.type === "select" && action.noteId === activeId) return;

    if (!dirtyRef.current) {
      dropActiveIfBlank();
      if (action.type === "select") setActiveId(action.noteId);
      if (action.type === "new") createNewNote();
      return;
    }

    setPendingAction(action);
  }, [activeId, createNewNote, dropActiveIfBlank]);

  const openNewNote = () => requestNotesAction({ type: "new" });

  // Close (X) the editor. If there are unsaved edits, ask first; otherwise just
  // close back to the empty placeholder (discarding an untouched new note).
  const requestCloseEditor = useCallback(() => {
    if (dirtyRef.current) {
      setPendingAction({ type: "close" });
      return;
    }
    dropActiveIfBlank();
    setActiveId("");
  }, [dropActiveIfBlank]);

  const handleSave = () => {
    if (!working) return;
    void persist(working);
  };

  const handleCancel = () => {
    resetToServerNotes();
  };

  const finishPendingAction = useCallback((action: PendingNotesAction, baseNotes?: Note[]) => {
    if (!action) return;

    if (action.type === "select") {
      const source = baseNotes ?? working ?? [];
      const next = source.some((note) => note.id === action.noteId) ? action.noteId : source[0]?.id;
      if (next) setActiveId(next);
      return;
    }

    if (action.type === "new") {
      createNewNote();
      return;
    }

    if (action.type === "close") {
      setActiveId("");
      return;
    }

    if (action.type === "route" && blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [blocker, createNewNote, working]);

  const closePendingAction = useCallback(() => {
    if (pendingAction?.type === "route" && blocker.state === "blocked") {
      blocker.reset();
    }
    setPendingAction(null);
  }, [blocker, pendingAction]);

  const discardPendingAction = useCallback(() => {
    const action = pendingAction;
    const base = resetToServerNotes();
    finishPendingAction(action, base);
    setPendingAction(null);
  }, [finishPendingAction, pendingAction, resetToServerNotes]);

  const savePendingAction = useCallback(async () => {
    if (!working) return;

    const action = pendingAction;
    const preferredActiveId =
      action?.type === "select" ? action.noteId : action?.type === "close" ? "" : activeId;
    await persist(working, preferredActiveId);
    finishPendingAction(action);
    setPendingAction(null);
  }, [activeId, finishPendingAction, pendingAction, persist, working]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const unsavedDialogOpen = pendingAction !== null;
  const pendingActionText =
    pendingAction?.type === "new"
      ? "You have unsaved changes in this note before creating a new one."
      : pendingAction?.type === "select"
        ? "You have unsaved changes in this note before switching notes."
        : pendingAction?.type === "close"
          ? "You have unsaved changes in this note before closing it."
          : "You have unsaved changes in this note before leaving Notes.";

  if (working === null) {
    return (
      <motion.section
        className="notes-workspace notes-workspace--loading"
        aria-label="Notes"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="ui-empty">
          <div className="ui-empty__art" aria-hidden="true">
            <Icon name="Note" />
          </div>
          <h1 className="ui-empty__title">Notes</h1>
          <p className="ui-empty__text" role="status">
            {notesQuery.isError ? "Could not load notes." : "Loading notes..."}
          </p>
        </div>
      </motion.section>
    );
  }

  const saving = saveNotes.isPending;
  const selectedDateValue = dateFilter.mode === "date" ? dateFilter.value : "";
  const dateFilterDisplay = noteDateFilterLabel(dateFilter);
  const hasActiveFilters =
    search.trim().length > 0 || dateFilter.mode !== "any" || category !== CATEGORY_FILTER_ALL;

  return (
    <motion.section
      className="notes-workspace"
      aria-label="Notes"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="notes-page-head">
        <header className="goals-page__header notes-header">
          <div>
            <h1 className="tasks-title">
              Notes <span className="notes-title-sprig" aria-hidden="true"><Icon name="Leaf" /></span>
            </h1>
            <p className="goals-page__subtitle notes-header__subtitle">Capture thoughts, ideas, and important details.</p>
          </div>
        </header>
      </div>

      <div className="notes-body">
        <aside className="notes-sidebar ui-card ui-card--soft" aria-label="Note categories">
          <div className="notes-sidebar__heading">
            <span>Notes</span>
            <button type="button" className="add-icon-btn" aria-label="New note" onClick={openNewNote}>
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <nav className="notes-nav" aria-label="Notes sections">
            <button
              type="button"
              className={`notes-nav__item ${category === CATEGORY_FILTER_ALL ? "is-active" : ""}`.trim()}
              onClick={() => setCategory(CATEGORY_FILTER_ALL)}
            >
              <span className="notes-nav__icon notes-nav__icon--accent">
                <Icon name="Note" />
              </span>
              <span>All Notes</span>
              <strong>{notes.length}</strong>
            </button>

            {navCategoryOptions.map((item) => {
              const filterValue = item ? item : CATEGORY_FILTER_NONE;
              return (
                <button
                  key={item || CATEGORY_FILTER_NONE}
                  type="button"
                  className={`notes-nav__item ${category === filterValue ? "is-active" : ""}`.trim()}
                  onClick={() => setCategory(filterValue)}
                >
                  <span className="notes-nav__icon notes-nav__icon--accent">
                    <Icon name={noteIcon(item)} />
                  </span>
                  <span>{noteCategoryLabel(item)}</span>
                  <strong>{categoryCounts.get(item) ?? 0}</strong>
                </button>
              );
            })}
          </nav>

          <div className="notes-nav notes-nav--secondary" aria-label="Archived notes">
            <button type="button" className="notes-nav__item">
              <span className="notes-nav__icon">
                <Icon name="Archive" />
              </span>
              <span>Archived</span>
              <strong>0</strong>
            </button>
            <button type="button" className="notes-nav__item">
              <span className="notes-nav__icon">
                <Icon name="Trash" />
              </span>
              <span>Trash</span>
              <strong>0</strong>
            </button>
          </div>
        </aside>

        <div className={`notes-main ${activeNote && editorExpanded ? "is-editor-expanded" : ""}`.trim()}>
          <div className="notes-tools" aria-label="Notes filters">
            <label className="ui-field notes-search">
              <span className="notes-control-icon">
                <Icon name="Search" />
              </span>
              <input
                className="ui-field__control"
                value={search}
                placeholder="Search notes..."
                aria-label="Search notes"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="notes-category-filter" ref={categoryFilterRef}>
              <button
                type="button"
                className={`notes-category-filter__trigger ${
                  category === CATEGORY_FILTER_ALL
                    ? "notes-category-filter__trigger--all"
                    : noteCategoryBadgeClass(category === CATEGORY_FILTER_NONE ? "" : category)
                }`.trim()}
                aria-label="Filter by category"
                aria-haspopup="listbox"
                aria-expanded={categoryFilterOpen}
                onClick={() => setCategoryFilterOpen((open) => !open)}
              >
                <Icon name={category === CATEGORY_FILTER_ALL ? "Tag" : noteIcon(category === CATEGORY_FILTER_NONE ? "" : category)} />
                {category === CATEGORY_FILTER_ALL
                  ? CATEGORY_FILTER_ALL
                  : noteCategoryLabel(category === CATEGORY_FILTER_NONE ? "" : category)}
                <span className="task-modal__dropdown-caret" aria-hidden="true" />
              </button>
              <div
                className="task-modal__dropdown-wrap notes-category-filter__dropdown"
                data-open={categoryFilterOpen ? "true" : "false"}
              >
                <ul
                  className="task-modal__combobox-list task-modal__combobox-list--pills notes-category-filter__list app-scroll"
                  role="listbox"
                  aria-label="Filter by category"
                >
                  {categoryFilterOptions.map((option) => {
                    const filterValue =
                      option === CATEGORY_FILTER_ALL ? CATEGORY_FILTER_ALL : option ? option : CATEGORY_FILTER_NONE;
                    const isAll = filterValue === CATEGORY_FILTER_ALL;
                    const categoryValue = filterValue === CATEGORY_FILTER_NONE ? "" : filterValue;
                    return (
                      <li key={filterValue} className="task-modal__dropdown-item">
                        <button
                          type="button"
                          role="option"
                          aria-selected={category === filterValue}
                          className={
                            isAll
                              ? "notes-category-filter__option notes-category-filter__option--all"
                              : `${noteCategoryBadgeClass(categoryValue)} notes-category-filter__option`
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setCategory(filterValue);
                            setCategoryFilterOpen(false);
                          }}
                        >
                          <Icon name={isAll ? "Tag" : noteIcon(categoryValue)} />
                          {isAll ? CATEGORY_FILTER_ALL : noteCategoryLabel(categoryValue)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <GoalDatePicker
              className="notes-date-picker"
              value={selectedDateValue}
              onChange={(value) => setDateFilter(value ? { mode: "date", value } : { mode: "any" })}
              ariaLabel="Filter notes by date"
              emptyDisplayValue={DATE_FILTER_ANY}
              displayValueOverride={
                dateFilter.mode === "last30" || selectedDateValue === toNoteIsoDate(new Date())
                  ? dateFilterDisplay
                  : undefined
              }
              footerActions={[
                {
                  label: DATE_FILTER_LAST_30,
                  onClick: () => setDateFilter({ mode: "last30" }),
                },
              ]}
            />

            <div className="notes-filter-strip ui-card ui-card--soft">
              <span>Filters:</span>
              {search.trim().length > 0 && (
                <button type="button" className="ui-badge ui-badge--accent ui-badge--md" onClick={() => setSearch("")}>
                  Search x
                </button>
              )}
              {dateFilter.mode !== "any" && (
                <button type="button" className="ui-badge ui-badge--accent ui-badge--md" onClick={() => setDateFilter({ mode: "any" })}>
                  {dateFilterDisplay} x
                </button>
              )}
              {category !== CATEGORY_FILTER_ALL && (
                <button
                  type="button"
                  className="ui-badge ui-badge--accent ui-badge--md"
                  onClick={() => setCategory(CATEGORY_FILTER_ALL)}
                >
                  {category === CATEGORY_FILTER_NONE ? NO_CATEGORY_LABEL : category} x
                </button>
              )}
              {!hasActiveFilters && <span className="notes-filter-strip__empty">None</span>}
              {hasActiveFilters && (
                <button
                  type="button"
                  className="pomodoro-btn pomodoro-btn--ghost-text notes-filter-strip__clear"
                  aria-label="Clear all filters"
                  title="Clear all filters"
                  onClick={() => {
                    setSearch("");
                    setCategory(CATEGORY_FILTER_ALL);
                    setDateFilter({ mode: "any" });
                  }}
                >
                  <Icon name="Close" />
                </button>
              )}
            </div>

            <button type="button" className="task-add notes-new-note" onClick={openNewNote}>
              <span aria-hidden="true">+</span>
              New note
            </button>
          </div>

          <div className="notes-content">
            {notes.length === 0 ? (
              <div className="goals-empty notes-empty-all">
                <strong>No notes yet</strong>
                <span>Capture your first thought and keep all your ideas in one calm place.</span>
                <button type="button" className="task-add goals-empty__cta" onClick={openNewNote}>
                  <span aria-hidden="true">+</span> Create your first note
                </button>
              </div>
            ) : (
            <>
            <section className="notes-list app-scroll" aria-label="Notes list">
              {filteredNotes.length === 0 ? (
                <div className="ui-empty notes-list__empty">
                  <h2 className="ui-empty__title">No notes found</h2>
                  <p className="ui-empty__text">Try another search or clear the active filters.</p>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const currentCategory = noteCategory(note);
                  const pinned = isPinned(note);
                  const menuOpen = cardMenuId === note.id;
                  const openNote = () => requestNotesAction({ type: "select", noteId: note.id });
                  return (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      className={`notes-list-card ui-card ui-card--interactive ${note.id === activeNote?.id ? "is-active" : ""} ${pinned ? "is-pinned" : ""}`.trim()}
                      onClick={openNote}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openNote();
                        }
                      }}
                    >
                      {pinned && (
                        <span className="notes-list-card__pin" aria-label="Pinned note">
                          <Icon name="Pin" />
                        </span>
                      )}
                      <div className="notes-card-menu">
                        <button
                          type="button"
                          className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--subtle notes-card-menu__trigger"
                          aria-label="Note actions"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={(event) => {
                            event.stopPropagation();
                            setCardMenuId(menuOpen ? null : note.id);
                          }}
                        >
                          <Icon name="More" />
                        </button>
                        {menuOpen && (
                          <div className="notes-card-menu__dropdown" role="menu" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              role="menuitem"
                              className="notes-card-menu__item"
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePinNote(note.id);
                              }}
                            >
                              <Icon name="Pin" /> {pinned ? "Unpin note" : "Pin note"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="notes-card-menu__item notes-card-menu__item--danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCardMenuId(null);
                                setDeleteTargetId(note.id);
                              }}
                            >
                              <Icon name="Trash" /> Delete note
                            </button>
                          </div>
                        )}
                      </div>
                      <strong>{note.title || "Untitled"}</strong>
                      {(() => {
                        const excerpt = noteExcerpt(note);
                        // Keep the line height even when the body is empty.
                        return <span>{excerpt ? `${excerpt}...` : " "}</span>;
                      })()}
                      <span className="notes-list-card__meta">
                        <span className={noteCategoryBadgeClass(currentCategory)}>
                          <Icon name={noteIcon(currentCategory)} /> {noteCategoryLabel(currentCategory)}
                        </span>
                        <small>{formatNoteDate(note)}</small>
                      </span>
                    </div>
                  );
                })
              )}
            </section>

            <section className="notes-editor-compose" aria-label="Selected note editor">
              {activeNote ? (
                  <article className="notes-entry-card notes-editor-card ui-card ui-card--elevated">
                    <header className="notes-entry-card__meta">
                      <div className="notes-entry-card__meta-main">
                        <span className="notes-entry-card__timestamp">
                          <Icon name="Calendar" /> {formatNoteTimestamp(new Date(noteActivityTime(activeNote)))}
                        </span>
                        <div className="notes-category-picker" ref={categoryPickerRef}>
                          <button
                            type="button"
                            className={`${noteCategoryBadgeClass(activeCategory)} notes-category-picker__trigger`}
                            aria-label="Change note category"
                            aria-haspopup="listbox"
                            aria-expanded={categoryMenuOpen}
                            onClick={() => {
                              setCategoryDraft("");
                              setCategoryMenuOpen((open) => !open);
                            }}
                          >
                            <Icon name={noteIcon(activeCategory)} /> {noteCategoryLabel(activeCategory)}
                            <span className="task-modal__dropdown-caret" aria-hidden="true" />
                          </button>
                          <div
                            className="task-modal__dropdown-wrap notes-category-picker__dropdown"
                            data-open={categoryMenuOpen ? "true" : "false"}
                          >
                            <input
                              ref={categoryInputRef}
                              className="notes-category-picker__input"
                              type="text"
                              maxLength={MAX_CATEGORY_LENGTH}
                              value={categoryDraft}
                              placeholder="Type category"
                              aria-label="Type note category"
                              onChange={(event) => setCategoryDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setCategoryMenuOpen(false);
                                  return;
                                }
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  chooseActiveCategory(categoryDraft);
                                }
                              }}
                            />
                            <ul
                              className="task-modal__combobox-list task-modal__combobox-list--pills notes-category-picker__list app-scroll"
                              role="listbox"
                              aria-label="Note category"
                            >
                              <li className="task-modal__dropdown-item">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={activeCategory === ""}
                                  className={noteCategoryBadgeClass("")}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => chooseActiveCategory("")}
                                >
                                  <Icon name={noteIcon("")} /> {NO_CATEGORY_LABEL}
                                </button>
                              </li>
                              {categoryDropdownOptions.map((option) => (
                                <li key={option} className="task-modal__dropdown-item">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={activeCategory === option}
                                    className={noteCategoryBadgeClass(option)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseActiveCategory(option)}
                                  >
                                    <Icon name={noteIcon(option)} /> {option}
                                  </button>
                                </li>
                              ))}
                              {canCreateCategory && (
                                <li className="task-modal__dropdown-item">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    className={noteCategoryBadgeClass(categoryDraftValue)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseActiveCategory(categoryDraftValue)}
                                  >
                                    <Icon name="Tag" /> Create "{categoryDraftValue}"
                                  </button>
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="notes-entry-window-actions">
                        <button
                          type="button"
                          className="ui-icon-btn notes-entry-expand"
                          aria-label={editorExpanded ? "Collapse editor" : "Expand editor"}
                          title={editorExpanded ? "Collapse editor" : "Expand editor"}
                          onClick={() => setEditorExpanded((expanded) => !expanded)}
                        >
                          <Icon name={editorExpanded ? "Minimize" : "Fullscreen"} />
                        </button>
                        <button
                          type="button"
                          className="ui-icon-btn notes-entry-close"
                          aria-label="Close note"
                          title="Close note"
                          onClick={requestCloseEditor}
                        >
                          <Icon name="Close" />
                        </button>
                      </div>
                    </header>

                    <div className="notes-entry-card__body">
                      <input
                        ref={noteTitleRef}
                        className="notes-entry-title"
                        value={activeNote.title}
                        maxLength={MAX_TITLE}
                        placeholder="What's on your mind?"
                        aria-label="Note title"
                        onChange={(event) => updateActive({ title: event.target.value.slice(0, MAX_TITLE) })}
                      />
                      <div
                        ref={editorRef}
                        className="notes-entry-textarea notes-entry-editor app-scroll"
                        role="textbox"
                        aria-label="Note contents"
                        aria-multiline="true"
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="Start writing your thoughts..."
                        onInput={handleEditorInput}
                        onKeyUp={refreshEditorFormatState}
                        onMouseUp={refreshEditorFormatState}
                        onFocus={() => {
                          if (editorRef.current && isEditorHtmlEmpty(activeNote.body)) {
                            editorRef.current.innerHTML = NOTE_EDITOR_INDENT_HTML;
                            editorRef.current.dataset.empty = "true";
                            moveCaretToEditorStart(editorRef.current);
                          }
                          refreshEditorFormatState();
                        }}
                      />
                    </div>

                    <footer className="notes-entry-card__footer">
                      <div className="notes-entry-toolbar" aria-label="Formatting toolbar">
                        {EDITOR_FORMAT_BUTTONS.map((item) => (
                          <button
                            key={item.format}
                            type="button"
                            className={`pomodoro-btn pomodoro-btn--ghost-text ${activeFormats[item.format] ? "is-active" : ""}`.trim()}
                            aria-label={item.ariaLabel}
                            aria-pressed={activeFormats[item.format]}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => runEditorCommand(item.format)}
                          >
                            {item.iconName ? (
                              <Icon name={item.iconName} />
                            ) : (
                              <span className={`notes-format-icon ${item.textClassName ?? ""}`.trim()}>
                                {item.label}
                              </span>
                            )}
                          </button>
                        ))}
                        <div className="notes-emoji-picker" ref={emojiPickerRef}>
                          <button
                            type="button"
                            className={`pomodoro-btn pomodoro-btn--ghost-text ${emojiPickerOpen ? "is-active" : ""}`.trim()}
                            aria-label="Insert emoji"
                            aria-expanded={emojiPickerOpen}
                            aria-haspopup="dialog"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              rememberEditorSelection();
                            }}
                            onClick={() => setEmojiPickerOpen((open) => !open)}
                          >
                            <Icon name="Smile" />
                          </button>
                          {emojiPickerOpen && (
                            <div className="notes-emoji-picker__popover">
                              <Suspense fallback={<div className="notes-emoji-picker__loading">Loading emoji...</div>}>
                                <EmojiPicker
                                  theme={"auto" as EmojiPickerTheme}
                                  width={248}
                                  height={268}
                                  lazyLoadEmojis
                                  searchPlaceholder="Search emoji"
                                  previewConfig={{ showPreview: false }}
                                  onEmojiClick={insertEmoji}
                                />
                              </Suspense>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="notes-entry-actions">
                        {dirty && <span className="notes-entry-unsaved">Unsaved Changes</span>}
                        <button
                          type="button"
                          className="pomodoro-btn pomodoro-btn--ghost-text"
                          onClick={handleCancel}
                          disabled={!dirty || saving}
                        >
                          Cancel
                        </button>
                        <button type="button" className="task-add" onClick={handleSave} disabled={!dirty || saving}>
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </footer>
                  </article>
              ) : (
                <div className="notes-editor-empty">
                  <p className="notes-editor-empty__hint">Open a note from the list, or create a new one.</p>
                </div>
              )}

              {deleteTargetId !== null && (
                <div
                  className="pomodoro-confirm-overlay notes-delete-confirm"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm note deletion"
                >
                  <div className="pomodoro-confirm__card">
                    <div className="pomodoro-confirm__icon" aria-hidden="true">
                      <Icon name="Trash" />
                    </div>
                    <div className="pomodoro-confirm__content">
                      <h3>Delete note?</h3>
                      <p>This will remove the note from the list. This can't be undone.</p>
                    </div>
                    <div className="pomodoro-confirm__actions">
                      <button
                        type="button"
                        className="pomodoro-btn pomodoro-btn--ghost-text"
                        onClick={() => setDeleteTargetId(null)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="goal-ghost-button goal-ghost-button--danger"
                        onClick={confirmDeleteNote}
                        disabled={saving}
                      >
                        {saving ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {unsavedDialogOpen && (
                <div
                  className="pomodoro-confirm-overlay notes-unsaved-confirm"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Unsaved changes"
                >
                  <div className="pomodoro-confirm__card">
                    <div className="pomodoro-confirm__icon" aria-hidden="true">
                      <Icon name="Note" />
                    </div>
                    <div className="pomodoro-confirm__content">
                      <h3>Unsaved changes</h3>
                      <p>{pendingActionText} Save them before leaving, or discard the changes?</p>
                    </div>
                    <div className="pomodoro-confirm__actions">
                      <button
                        type="button"
                        className="pomodoro-btn pomodoro-btn--ghost-text"
                        onClick={closePendingAction}
                        disabled={saving}
                      >
                        Stay
                      </button>
                      <button
                        type="button"
                        className="goal-ghost-button goal-ghost-button--danger"
                        onClick={discardPendingAction}
                        disabled={saving}
                      >
                        Discard changes
                      </button>
                      <button
                        type="button"
                        className="task-add"
                        onClick={() => {
                          void savePendingAction();
                        }}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
            </>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
