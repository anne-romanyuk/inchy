import type { ReactElement } from "react";

export type GoalStarterKind = "steps" | "number" | "milestones" | "repeat";

type GoalStarterOption = {
  kind: GoalStarterKind;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  Icon: () => ReactElement;
};

const STARTER_OPTIONS: GoalStarterOption[] = [
  {
    kind: "steps",
    title: "Add a first step",
    description: "Start by taking one small step",
    imageSrc: "/goal-starters/first-step-balanced.png",
    imageAlt: "",
    Icon: StarterCheckIcon,
  },
  {
    kind: "number",
    title: "Track a number",
    description: "Books, money, hours, km",
    imageSrc: "/goal-starters/track-number-balanced.png",
    imageAlt: "",
    Icon: StarterChartIcon,
  },
  {
    kind: "milestones",
    title: "Break into stages",
    description: "Use milestones for bigger goals",
    imageSrc: "/goal-starters/milestones-balanced.png",
    imageAlt: "",
    Icon: StarterFlagIcon,
  },
  {
    kind: "repeat",
    title: "Make it repeat",
    description: "Build a routine and stay consistent",
    imageSrc: "/goal-starters/repeat-balanced.png",
    imageAlt: "",
    Icon: StarterRepeatIcon,
  },
];

type GoalStarterOptionsProps = {
  onSelect: (kind: GoalStarterKind) => void;
  disabledKinds?: GoalStarterKind[];
  className?: string;
};

export function GoalStarterOptions({
  onSelect,
  disabledKinds = [],
  className = "",
}: GoalStarterOptionsProps) {
  const disabledSet = new Set(disabledKinds);

  return (
    <section className={`goal-starter tasks-panel tasks-panel--today ${className}`.trim()} aria-label="Choose goal type">
      <header className="goal-starter__header">
        <div>
          <h2>How would you like to start?</h2>
          <p>Choose a starter option below.</p>
        </div>
      </header>

      <div className="goal-starter__grid">
        {STARTER_OPTIONS.map((option) => {
          const disabled = disabledSet.has(option.kind);
          return (
            <button
              key={option.kind}
              type="button"
              className={`goal-starter-card goal-starter-card--${option.kind}`}
              onClick={() => onSelect(option.kind)}
              disabled={disabled}
              aria-label={disabled ? `${option.title}. Coming soon.` : option.title}
            >
              <span className="goal-starter-card__icon" aria-hidden="true">
                <option.Icon />
              </span>
              <span className="goal-starter-card__copy">
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
              <img className="goal-starter-card__art" src={option.imageSrc} alt={option.imageAlt} draggable={false} />
              <span className="goal-starter-card__arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>

      <p className="goal-starter__tip">
        <img className="goal-starter__tip-icon" src="/goal-starters/tip-sprout.png" alt="" aria-hidden="true" />
        Tip: Starting small makes it easier to keep going. You can build, adjust, and grow your plan anytime.
      </p>
    </section>
  );
}

function StarterCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="m8.6 12.1 2.1 2.2 4.8-5" />
    </svg>
  );
}

function StarterChartIcon() {
  return (
    <svg className="goal-starter-chart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="goal-starter-chart-icon__axis" d="M4.8 19.2h14.4" />
      <path className="goal-starter-chart-icon__bar" d="M7 19.2v-4.4" />
      <path className="goal-starter-chart-icon__bar" d="M11 19.2v-6.2" />
      <path className="goal-starter-chart-icon__bar" d="M15 19.2v-8" />
      <path className="goal-starter-chart-icon__bar" d="M19 19.2v-9.8" />
      <path className="goal-starter-chart-icon__trend" d="M5.4 10.8C9.5 10.2 13.4 7.4 18.2 3.9" />
      <path className="goal-starter-chart-icon__trend" d="M18.2 3.9 17.9 7.2" />
      <path className="goal-starter-chart-icon__trend" d="M18.2 3.9 14.9 4.6" />
    </svg>
  );
}

function StarterFlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 19V5.5" />
      <path d="M7 6.2c2.8-1.4 4.8 1.5 7.8.2.8-.3 1.4-.7 2.2-1.1v8.2c-3 1.9-5.3-1.2-8.4.3-.5.2-1 .5-1.6.8" />
    </svg>
  );
}

function StarterRepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M17.5 8.4H8.7a4.2 4.2 0 0 0-4.2 4.2v.2" />
      <path d="m14.8 5.7 2.8 2.7-2.8 2.7" />
      <path d="M6.5 15.6h8.8a4.2 4.2 0 0 0 4.2-4.2v-.2" />
      <path d="m9.2 18.3-2.8-2.7 2.8-2.7" />
    </svg>
  );
}
