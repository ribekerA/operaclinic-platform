type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  tone?: "accent" | "navy" | "neutral";
  className?: string;
}

const sizeClassName: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

const toneClassName: Record<NonNullable<AvatarProps["tone"]>, string> = {
  accent: "bg-accent text-white",
  navy: "bg-navy text-white",
  neutral: "bg-slate-200 text-slate-700",
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export function Avatar({ name, size = "md", tone = "accent", className = "" }: AvatarProps) {
  return (
    <div
      role="img"
      aria-label={name}
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClassName[size]} ${toneClassName[tone]} ${className}`}
    >
      {initialsFrom(name)}
    </div>
  );
}
