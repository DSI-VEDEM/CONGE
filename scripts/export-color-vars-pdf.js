const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

function collectCssFile() {
  const cssDir = path.join(process.cwd(), '.next', 'static', 'css');
  if (!fs.existsSync(cssDir)) {
    throw new Error(`CSS directory not found at ${cssDir}`);
  }
  const files = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  if (!files.length) {
    throw new Error('No CSS file found under .next/static/css');
  }
  return path.join(cssDir, files[0]);
}

function parseColorVariables(content) {
  const regex = /(--color-[\w-]+)\s*:\s*([^;\s}]+)\s*;/g;
  const seen = new Set();
  const entries = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const rawValue = match[2];
    if (seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, value: rawValue });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function toRgb(color) {
  const hex = color.replace(/\s+/g, '');
  if (/^#([0-9a-fA-F]{3}){1,2}$/.test(hex)) {
    const normalized = hex.slice(1).length === 3
      ? hex.slice(1).split('').map((ch) => ch + ch).join('')
      : hex.slice(1);
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return { r, g, b };
  }
  const rgbMatch = /rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/.exec(color);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

function rgbToPdf(color) {
  if (!color) return { r: 0.96, g: 0.96, b: 0.96 };
  return {
    r: color.r / 255,
    g: color.g / 255,
    b: color.b / 255,
  };
}

(async () => {
  const cssPath = collectCssFile();
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const palette = parseColorVariables(cssContent);

  if (!palette.length) {
    throw new Error('No --color- variables found in CSS.');
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 40;
  const BOX_WIDTH = 100;
  const BOX_HEIGHT = 40;
  const ROW_HEIGHT = 60;
  const TEXT_OFFSET_X = BOX_WIDTH + 20;
  const TEXT_BASELINE_OFFSET = 15;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let yCursor = PAGE_HEIGHT - MARGIN;

  const writeHeader = () => {
    page.drawText('Palette de couleurs (variables --color-*)', {
      x: MARGIN,
      y: yCursor,
      size: 16,
      font: boldFont,
    });
    yCursor -= ROW_HEIGHT;
  };

  writeHeader();

  for (const entry of palette) {
    if (yCursor - ROW_HEIGHT < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      yCursor = PAGE_HEIGHT - MARGIN;
      writeHeader();
    }

    const colorValue = toRgb(entry.value);
    const fillColor = rgbToPdf(colorValue);
    page.drawRectangle({
      x: MARGIN,
      y: yCursor - BOX_HEIGHT,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      color: fillColor,
      borderColor: { r: 0, g: 0, b: 0 },
      borderWidth: 0.5,
    });

    page.drawText(entry.name, {
      x: MARGIN + TEXT_OFFSET_X,
      y: yCursor - TEXT_BASELINE_OFFSET,
      size: 12,
      font: boldFont,
    });

    page.drawText(entry.value, {
      x: MARGIN + TEXT_OFFSET_X,
      y: yCursor - TEXT_BASELINE_OFFSET - 14,
      size: 10,
      font,
    });

    yCursor -= ROW_HEIGHT;
  }

  const docsDir = path.join(process.cwd(), 'DOCS');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const outPath = path.join(docsDir, 'vdm-color-variables.pdf');
  await fs.promises.writeFile(outPath, await pdfDoc.save());
  console.log(`PDF généré dans ${outPath}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
