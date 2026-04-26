import Image from "next/image";

interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function BrandMark({
  className = "",
  imageClassName = "",
  priority = false,
}: BrandMarkProps) {
  return (
    <div className={className}>
      <Image
        src="/brand/opera-clinica-icon.png"
        alt="OperaClinic"
        width={360}
        height={360}
        priority={priority}
        className={`h-auto w-full object-contain ${imageClassName}`}
      />
    </div>
  );
}
