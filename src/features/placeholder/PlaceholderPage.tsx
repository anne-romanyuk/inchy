import { motion } from "motion/react";

export function PlaceholderPage({ label }: { label: string }) {
  return (
    <motion.section
      className="tasks-panel goals-placeholder"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="tasks-title">{label}</h1>
    </motion.section>
  );
}
