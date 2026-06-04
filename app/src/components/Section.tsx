interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export default function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-xl bg-canvas-parchment">
      <h3 className="px-4 pt-3 pb-2 text-[13px] font-semibold tracking-wide text-ink-muted-48">
        {title}
      </h3>
      <div className="divide-y divide-surface-chip">{children}</div>
    </section>
  );
}
