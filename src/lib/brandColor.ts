/**
 * Brand color helpers — convert any hex color into HSL components and a full
 * palette of CSS variables (--brand, --brand-hover, etc.) so the whole UI
 * (CRM + landing pages) follows the workspace brand color.
 */

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
  }
  return {
    h: Math.round(hue),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Build the full CSS variable map (both `--brand-*` raw colors and HSL tokens for shadcn). */
export function buildBrandCssVars(hex: string | null | undefined): Record<string, string> {
  const fallback = '#7C3AED';
  const color = hex && /^#?[0-9a-fA-F]{3,8}$/.test(hex.trim()) ? hex.trim() : fallback;
  const hsl = hexToHsl(color) || hexToHsl(fallback)!;
  const hslStr = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
  const ringL = Math.min(100, hsl.l + 5);
  const accentL = Math.max(0, Math.min(100, Math.round(hsl.l * 0.45)));
  const accentFgL = Math.min(100, hsl.l + 35);
  return {
    // shadcn semantic tokens — overridden so the whole CRM follows the brand
    '--primary': hslStr,
    '--ring': `${hsl.h} ${hsl.s}% ${ringL}%`,
    '--sidebar-primary': hslStr,
    '--sidebar-ring': hslStr,
    '--accent': `${hsl.h} ${Math.max(20, Math.round(hsl.s * 0.7))}% ${accentL}%`,
    '--accent-foreground': `${hsl.h} ${Math.min(100, hsl.s + 10)}% ${accentFgL}%`,
    '--gradient-start': hslStr,
    '--gradient-end': `${hsl.h} ${Math.max(20, hsl.s - 20)}% ${Math.min(85, hsl.l + 15)}%`,
    '--glass-shine': hslStr,

    // Raw brand tokens — used by landing pages (`var(--brand)`, `var(--brand-soft)`, etc.)
    '--brand': color,
    '--brand-hover': `color-mix(in srgb, ${color} 88%, white)`,
    '--brand-soft': `color-mix(in srgb, ${color} 18%, transparent)`,
    '--brand-softer': `color-mix(in srgb, ${color} 10%, transparent)`,
    '--brand-border': `color-mix(in srgb, ${color} 30%, transparent)`,
    '--brand-border-strong': `color-mix(in srgb, ${color} 50%, transparent)`,
    '--brand-light': `color-mix(in srgb, ${color} 70%, white)`,
    '--brand-glow': `color-mix(in srgb, ${color} 30%, transparent)`,
    '--brand-deep': `color-mix(in srgb, ${color} 25%, black)`,
    '--brand-deep-border': `color-mix(in srgb, ${color} 35%, black)`,
  };
}

/** Apply the brand palette to a target element (or document.documentElement by default). */
export function applyBrandToElement(
  hex: string | null | undefined,
  el: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
) {
  if (!el) return;
  const vars = buildBrandCssVars(hex);
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
}
