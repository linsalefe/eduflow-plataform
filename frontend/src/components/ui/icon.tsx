import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const sizeMap: Record<IconSize, number> = {
  xs: 14,   // badges, captions
  sm: 16,   // inline com body text
  md: 20,   // navegação e botões
  lg: 24,   // headers de seção
  xl: 32,   // empty states
  "2xl": 48, // empty states grandes
};

interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
}

export function Icon({ icon: LucideIcon, size = "md", className }: IconProps) {
  return (
    <LucideIcon
      size={sizeMap[size]}
      strokeWidth={1.75}
      className={cn(className)}
    />
  );
}