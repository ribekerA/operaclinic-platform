interface PublicSectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
}

export function PublicSectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: PublicSectionHeadingProps) {
  const alignment = align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl";

  return (
    <div className={`space-y-3 ${alignment}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
        {title}
      </h2>
      <p className="text-sm leading-7 text-muted sm:text-base">{description}</p>
    </div>
  );
}
