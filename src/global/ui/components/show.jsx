import { motion, AnimatePresence } from "framer-motion";

export default function Show({
  show = false,
  effect = "opacity", // "opacity" | "reveal"
  children,
}) {
  if (effect === "reveal") {
    return (
      <AnimatePresence initial={false}>
        {show ? (
          <motion.div
            key="reveal"
            layout
            style={{ overflow: "hidden" }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  // Default: opacity-only (no layout impact)
  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{ pointerEvents: show ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  );
}