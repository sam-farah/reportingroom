// Helpers for landscape worksheet support.
//
// A worksheet can be flagged "landscape" so it displays wide on the reporting
// screen. For transmission (PDF / emailed HTML / fax) the page itself stays
// portrait A4 — we rotate the image 90° so it fills the portrait page and the
// reader simply turns the printout side-on. Rotating is baked into the image
// bytes (not CSS) so it survives fax gateways and Outlook.

export type WorksheetOrientation = "portrait" | "landscape";

/** True when an image is meaningfully wider than tall (candidate for landscape). */
export function isLandscapeDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width >= height * 1.2;
}

/** Reads the natural pixel dimensions of an image file (from a File/Blob). */
export function readImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

/**
 * On upload, measures an image and — if it's clearly landscape (wider than
 * tall) — asks the uploader whether to display it in landscape. Returns the
 * chosen orientation. PDFs and un-measurable files default to portrait.
 */
export async function detectOrientationWithConfirm(file: File | Blob): Promise<WorksheetOrientation> {
  if ((file as File).type === "application/pdf") return "portrait";
  try {
    const { width, height } = await readImageDimensions(file);
    if (isLandscapeDimensions(width, height)) {
      const wantLandscape = window.confirm(
        "This worksheet looks like landscape (it's wider than it is tall).\n\n" +
          "OK  →  Display it in landscape (it will be rotated to fit a portrait page when printed, faxed or emailed)\n\n" +
          "Cancel  →  Keep it portrait",
      );
      return wantLandscape ? "landscape" : "portrait";
    }
  } catch {
    // Un-measurable (e.g. exotic format) — safest default is portrait.
  }
  return "portrait";
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Rotates a data-URL image 90° clockwise and returns a new data URL. A wide
 * (landscape) image becomes tall (portrait aspect) so it fills a portrait page.
 * The source format (PNG vs JPEG) is preserved.
 */
export async function rotateDataUrl90CW(dataUrl: string): Promise<string> {
  const img = await loadImageEl(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  const isPng = dataUrl.startsWith("data:image/png");
  return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92);
}

/**
 * For transmission: returns the data URL rotated to portrait when the worksheet
 * is flagged landscape, otherwise the original untouched.
 */
export async function toTransmissionDataUrl(
  dataUrl: string | null,
  orientation: WorksheetOrientation | null | undefined,
): Promise<string | null> {
  if (!dataUrl) return dataUrl;
  if (orientation === "landscape") {
    try {
      return await rotateDataUrl90CW(dataUrl);
    } catch {
      return dataUrl;
    }
  }
  return dataUrl;
}
