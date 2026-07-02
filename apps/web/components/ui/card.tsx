type CardAs = "div" | "section" | "article" | "aside";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "dark";
  as?: CardAs;
}

const toneClassName: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "border-slate-200/80 bg-white/90 text-ink backdrop-blur",
  dark: "border-slate-900/70 bg-slate-950 text-white",
};

export function Card({
  children,
  className = "",
  tone = "default",
  as: Tag = "div",
  ...props
}: CardProps) {
  return (
    <Tag
      {...props}
      className={`rounded-[28px] border p-5 shadow-panel ${toneClassName[tone]} ${className}`}
    >
      {children}
    </Tag>
  );
}
