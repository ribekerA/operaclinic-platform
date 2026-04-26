interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "dark";
}

const toneClassName: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "border-slate-200/80 bg-white/90 text-ink backdrop-blur",
  dark: "border-slate-900/70 bg-slate-950 text-white",
};

export function Card({
  children,
  className = "",
  tone = "default",
  ...props
}: CardProps) {
  return (
    <section
      {...props}
      className={`rounded-[28px] border p-5 shadow-panel ${toneClassName[tone]} ${className}`}
    >
      {children}
    </section>
  );
}
