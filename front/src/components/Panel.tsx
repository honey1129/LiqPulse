import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <section className={`rounded-md border border-slate-200 bg-white/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_12px_28px_rgba(15,23,42,0.06)] dark:border-sky-400/[0.12] dark:bg-ink-900/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}>
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">{title}</div>
      {children}
    </section>
  );
}
