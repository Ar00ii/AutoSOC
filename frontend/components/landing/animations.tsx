"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

/** Reveals a box by clipping it from one edge — feels like a screen wipe. */
export function ClipReveal({
  children,
  direction = "left",
  delay = 0,
  duration = 0.7,
  className = "",
}: {
  children: ReactNode;
  direction?: "left" | "right" | "top" | "bottom";
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const from =
    direction === "left"
      ? "inset(0 100% 0 0)"
      : direction === "right"
      ? "inset(0 0 0 100%)"
      : direction === "top"
      ? "inset(100% 0 0 0)"
      : "inset(0 0 100% 0)";
  return (
    <motion.div
      className={className}
      initial={{ clipPath: reduced ? "inset(0)" : from }}
      whileInView={{ clipPath: "inset(0)" }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts a number up from 0 when it enters the viewport. */
export function AnimatedNumber({
  to,
  duration = 1.4,
  suffix = "",
  className = "",
}: {
  to: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const mv = useMotionValue(reduced ? to : 0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (v) => Math.floor(v).toLocaleString("en-US") + suffix);

  useEffect(() => {
    if (inView && !reduced) mv.set(to);
  }, [inView, to, mv, reduced]);

  return <motion.span ref={ref} className={className}>{display}</motion.span>;
}

/** Underline that draws itself left-to-right when in view. */
export function DrawUnderline({ delay = 0, className = "h-px bg-ink" }: { delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={"origin-left " + className}
      initial={{ scaleX: reduced ? 1 : 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.8, delay, ease: [0.2, 0.7, 0.2, 1] }}
    />
  );
}

/** SVG path that draws itself when in view. */
export function DrawPath({
  d,
  stroke = "#000",
  strokeWidth = 1,
  strokeDasharray,
  delay = 0,
  duration = 1.2,
}: {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  delay?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      initial={{ pathLength: reduced ? 1 : 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ pathLength: { duration, delay, ease: [0.2, 0.7, 0.2, 1] }, opacity: { duration: 0.2, delay } }}
    />
  );
}

/** A box that "ticks" in: small scale + tiny rotate, then settles. */
export function TickIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 8 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Mouse-tracking spotlight inside its parent. Add to cards for a subtle hover lift. */
export function Spotlight({ size = 280 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; v: number }>({ x: 0, y: 0, v: 0 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top, v: 1 });
    };
    const onLeave = () => setPos((p) => ({ ...p, v: 0 }));
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 transition-opacity duration-300"
      style={{
        opacity: pos.v * 0.06,
        background: `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, #000 0%, transparent 60%)`,
      }}
    />
  );
}
