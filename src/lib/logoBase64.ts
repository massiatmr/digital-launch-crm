// This file exports the logo as a base64 string for PDF generation
// We use a dynamic import approach to avoid bloating the bundle
export async function getLogoBase64(): Promise<string> {
  const response = await fetch(new URL('@/assets/logo.webp', import.meta.url).href);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
