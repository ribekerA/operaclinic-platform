import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function BrandLogo({
  className = "",
  imageClassName = "",
  priority = false,
}: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src="/brand/opera-clinica-logo.png"
        alt="OperaClinic"
        width={540}
        height={404}
        priority={priority}
        className={`h-auto w-full object-contain ${imageClassName}`}
      />
    </div>
  );
}
