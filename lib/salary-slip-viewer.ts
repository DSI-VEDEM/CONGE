export function openSalarySlipViewer(
  fileDataUrl: string,
  signatureImageDataUrl?: string | null,
  existingWindow?: Window | null
) {
  const popup = existingWindow ?? window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return false;

  const safePdf = toBlobUrl(fileDataUrl) ?? fileDataUrl;
  const hasSignature = Boolean(signatureImageDataUrl);
  const safeSignature = signatureImageDataUrl ?? "";

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bulletin signé</title>
    <style>
      html, body { margin: 0; height: 100%; background: #f3f4f6; }
      .wrap { position: relative; width: 100%; height: 100%; }
      .pdf { width: 100%; height: 100%; border: 0; background: white; }
      .fallback {
        position: fixed;
        top: 108px;
        left: 8px;
        z-index: 50;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid #d4af37;
        background: rgba(255,255,255,0.96);
        font: 13px/1.3 sans-serif;
      }
      .fallback a { color: #8a6d00; text-decoration: none; font-weight: 600; }
      .sig {
        position: fixed;
        bottom: 14px;
        right: 20px;
        max-width: 220px;
        max-height: 90px;
        object-fit: contain;
        background: rgba(255,255,255,0.92);
        border: 1px solid #d4af37;
        border-radius: 8px;
        padding: 4px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="fallback">Si la page reste blanche: <a href="${safePdf}" target="_self">ouvrir le PDF</a></div>
      <iframe class="pdf" src="${safePdf}" title="Bulletin de salaire"></iframe>
      ${hasSignature ? `<img class="sig" src="${safeSignature}" alt="Signature PDG" />` : ""}
    </div>
  </body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.addEventListener("beforeunload", () => {
    if (safePdf.startsWith("blob:")) {
      URL.revokeObjectURL(safePdf);
    }
  });
  return true;
}

function toBlobUrl(dataUrl: string) {
  try {
    const parts = dataUrl.split(",", 2);
    if (parts.length !== 2) return null;

    const header = parts[0];
    const payload = parts[1];
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    if (!mimeMatch) return null;

    const mimeType = mimeMatch[1] ?? "application/octet-stream";
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
