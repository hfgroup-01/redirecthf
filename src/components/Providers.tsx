"use client";

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";

/**
 * Framer Motion carregado de forma enxuta (LazyMotion + `m.*`) e respeitando
 * prefers-reduced-motion do sistema em todas as animações.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
