interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export default function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-xl bg-[#F5F5F7]">
      <h3 className="px-4 pt-3 pb-2 text-[13px] font-semibold tracking-wide text-[#86868B]">
        {title}
      </h3>
      <div className="divide-y divide-[#D2D2D7]">{children}</div>
    </section>
  );
}
