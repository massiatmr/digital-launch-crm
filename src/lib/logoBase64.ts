// Loads the black logo (PDF-optimized) as base64 data URL
import logoUrl from '@/assets/logo-black.png';

let cached: string | null = null;

export async function getLogoBase64(): Promise<string> {
  if (cached) return cached;
  const response = await fetch(logoUrl);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      cached = reader.result as string;
      resolve(cached);
    };
    reader.readAsDataURL(blob);
  });
}
