import type { ReactNode } from "react";

type PanelProps = {
  id: string;
  title: string;
  note: string;
  children: ReactNode;
};

/** Shared broadcast frame for arena sections. */
export function Panel({ id, title, note, children }: PanelProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
    >
      <h2
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500"
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
      <p className="mt-3 text-xs text-zinc-500">{note}</p>
    </section>
  );
}
