"use client";

/**
 * Peças animadas do painel (framer-motion via `m`, carregado pelo LazyMotion em
 * Providers). Regras: 150–300ms, só transform/opacity, ease-out na entrada,
 * 1–2 animações por tela, reduced-motion respeitado.
 */
import { AnimatePresence, animate, m, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Troca de página: fade + leve deslocamento. Não anima em router.refresh() (mesma rota). */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={path}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

/** Entrada suave de um bloco (cards, seções). `i` escalona o atraso. */
export function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: Math.min(i, 8) * 0.05, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

/** Linha de tabela com entrada escalonada (só na montagem; refresh não re-anima). */
export function Tr({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.tr
      className={className}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(i, 14) * 0.02, ease: EASE_OUT }}
    >
      {children}
    </m.tr>
  );
}

/** Mensagem de status que entra/sai com fade (usada pelo Msg). */
export function FadeMsg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={true}>
      <m.div
        role="status"
        className={className}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

/** Número que "sobe" até o valor (600ms). Com reduced-motion mostra direto. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const texto = useTransform(mv, (v) => Math.round(v).toLocaleString("pt-BR"));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <m.span className={className}>{texto}</m.span>;
}

/** Barra de progresso fina no topo enquanto uma navegação está pendente. */
export function TopProgress({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          key="progress"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: [0, 0.6, 0.85], transition: { duration: 1.6, times: [0, 0.4, 1], ease: "easeOut" } }}
          exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.25 } }}
        />
      ) : null}
    </AnimatePresence>
  );
}

/** Barra vertical do gráfico: cresce de baixo para cima na montagem. */
export function BarraAnimada({ altura, i, className }: { altura: number; i: number; className?: string }) {
  return (
    <m.div
      className={className}
      style={{ height: altura, originY: 1 }}
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.02, ease: EASE_OUT }}
    />
  );
}
