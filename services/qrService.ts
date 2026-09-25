import { nanoid } from "nanoid";
import QRCode from "qrcode";

/** Generates a unique, unguessable verification code for a published result. */
export function generateVerificationCode(): string {
  return nanoid(16);
}

/** Builds the public verification URL embedded in the result's QR code. */
export function buildVerificationUrl(code: string): string {
  const base = process.env.QR_VERIFICATION_BASE_URL || "/result-verification";
  return `${base}?code=${encodeURIComponent(code)}`;
}

/** Renders a QR code as a data URL (PNG) for embedding in a generated PDF. */
export async function renderQrCodeDataUrl(code: string): Promise<string> {
  const url = buildVerificationUrl(code);
  return QRCode.toDataURL(url, { margin: 1, width: 200 });
}
