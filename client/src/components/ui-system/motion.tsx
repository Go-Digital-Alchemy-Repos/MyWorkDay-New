import { motion, AnimatePresence, type Variants, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

const defaultTransition: Transition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};

const quickTransition: Transition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
};

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const slideDownVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

export const slideRightVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
};

export const scaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -8, transition: quickTransition },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const checkVariants: Variants = {
  unchecked: { scale: 1 },
  checked: { 
    scale: [1, 1.2, 1],
    transition: { duration: 0.25 }
  },
};

export const pulseVariants: Variants = {
  initial: { scale: 1 },
  pulse: { 
    scale: [1, 1.05, 1],
    transition: { duration: 0.2 }
  },
};

export const sendVariants: Variants = {
  idle: { x: 0, opacity: 1 },
  sending: { 
    x: 20, 
    opacity: 0,
    transition: { duration: 0.15 }
  },
  sent: { 
    x: 0, 
    opacity: 1,
    transition: { duration: 0.15 }
  },
};

interface MotionFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function MotionFade({ children, className, delay = 0 }: MotionFadeProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeVariants}
      transition={{ ...defaultTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionSlideProps {
  children: React.ReactNode;
  className?: string;
  direction?: "up" | "down" | "right";
  delay?: number;
}

export function MotionSlide({ children, className, direction = "up", delay = 0 }: MotionSlideProps) {
  const variants = {
    up: slideUpVariants,
    down: slideDownVariants,
    right: slideRightVariants,
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={variants[direction]}
      transition={{ ...defaultTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionListProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionList({ children, className }: MotionListProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionListItemProps {
  children: React.ReactNode;
  className?: string;
  layoutId?: string;
}

export function MotionListItem({ children, className, layoutId }: MotionListItemProps) {
  return (
    <motion.div
      variants={listItemVariants}
      transition={quickTransition}
      layout={!!layoutId}
      layoutId={layoutId}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionScaleProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionScale({ children, className }: MotionScaleProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={scaleVariants}
      transition={defaultTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionCheckProps {
  checked: boolean;
  children: React.ReactNode;
  className?: string;
}

export function MotionCheck({ checked, children, className }: MotionCheckProps) {
  return (
    <motion.div
      animate={checked ? "checked" : "unchecked"}
      variants={checkVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionPresenceProps {
  children: React.ReactNode;
  mode?: "wait" | "sync" | "popLayout";
}

export function MotionPresence({ children, mode = "sync" }: MotionPresenceProps) {
  return (
    <AnimatePresence mode={mode}>
      {children}
    </AnimatePresence>
  );
}

export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const drawerSlideVariants: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
};

export const pageTransitionVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

interface MotionPageProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionPage({ children, className }: MotionPageProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageTransitionVariants}
      transition={defaultTransition}
      className={cn("h-full", className)}
    >
      {children}
    </motion.div>
  );
}

interface MotionDrawerContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionDrawerContent({ children, className }: MotionDrawerContentProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={drawerSlideVariants}
      transition={defaultTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const Motion = motion;
export { AnimatePresence };
