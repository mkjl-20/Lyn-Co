import { useState } from "react";

interface SalonLogoImageProps {
  src: string;
  alt: string;
  className: string;
}

export function SalonLogoImage({ src, alt, className }: SalonLogoImageProps) {
  const [portraitSource, setPortraitSource] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const isCurrentLogoPortrait = portraitSource === src && isPortrait;

  return (
    <img
      src={src}
      alt={alt}
      onLoad={(event) => {
        setPortraitSource(src);
        setIsPortrait(event.currentTarget.naturalHeight > event.currentTarget.naturalWidth);
      }}
      className={`${className}${isCurrentLogoPortrait ? " max-h-[85%] max-w-[85%]" : ""}`}
    />
  );
}
