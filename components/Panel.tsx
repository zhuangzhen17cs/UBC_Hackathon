import type { ReactNode } from "react";

type PanelProps = {
  id: string;
  title: string;
  note: string;
  children: ReactNode;
};

/** Shared block frame for arena sections. */
export function Panel({ id, title, note, children }: PanelProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId} className="mc-panel">
      <h2 id={headingId}>{title}</h2>
      <div className="mt-3">{children}</div>
      <p className="mt-3 text-sm text-[#d9cbb6]">{note}</p>
    </section>
  );
}
