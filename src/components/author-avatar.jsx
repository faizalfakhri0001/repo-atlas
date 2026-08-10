import { authorHue, authorInitials, cn } from "@/lib/utils";

export function AuthorAvatar({ name, email, size = 22, className }) {
  const hue = authorHue(email || name);
  return (
    <span
      title={email ? `${name} <${email}>` : name}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: `linear-gradient(135deg, oklch(0.72 0.14 ${hue}), oklch(0.55 0.16 ${(hue + 40) % 360}))`,
      }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase tracking-wide text-white/95 shadow-sm",
        className,
      )}
    >
      {authorInitials(name)}
    </span>
  );
}
