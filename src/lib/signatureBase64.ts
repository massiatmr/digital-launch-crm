// Loads the default provider signature as a base64 data URL for PDF embedding
import signatureUrl from '@/assets/signature-default.png';

let cached: string | null = null;

export async function getDefaultSignatureBase64(): Promise<string> {
  if (cached) return cached;
  const response = await fetch(signatureUrl);
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
