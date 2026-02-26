/**
 * PARCHMENT PRAYER CARD — Canvas Image Generator
 *
 * Draws a downloadable prayer card onto an invisible canvas:
 *   - Warm aged-paper background gradient
 *   - Cross (✝) divider
 *   - Prayer text in serif italic
 *   - Scripture reference + verse text
 *   - Padre Pio footer
 *
 * Output: 1080×1920 PNG (9:16 — Instagram/TikTok Story format)
 * No external dependencies — pure Canvas API.
 */

interface ParchmentCardData {
  devotionalText: string;
  scriptureReference: string;
  scriptureText: string;
  archetype?: string;
}

const CARD_W = 1080;
const CARD_H = 1920; // 9:16 — Instagram/TikTok Story format

// Word-wrap helper: splits text into lines that fit within maxWidth
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generate parchment prayer card as a PNG data URL.
 */
export function generateParchmentImage(data: ParchmentCardData): string {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  // ── Background: warm parchment gradient ──────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.3, CARD_H);
  bg.addColorStop(0, '#f7ecd4');
  bg.addColorStop(0.45, '#f0e2bc');
  bg.addColorStop(1, '#e5d4a0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle paper texture: random faint dots
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * CARD_W;
    const y = Math.random() * CARD_H;
    const r = Math.random() * 2 + 0.5;
    ctx.fillStyle = Math.random() > 0.5 ? '#8b5a2b' : '#a08060';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Top & bottom aged border stripes ─────────────────────────────────────
  const borderGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  borderGrad.addColorStop(0, 'transparent');
  borderGrad.addColorStop(0.2, 'rgba(139,90,43,0.35)');
  borderGrad.addColorStop(0.8, 'rgba(139,90,43,0.35)');
  borderGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, CARD_W, 4);
  ctx.fillRect(0, CARD_H - 4, CARD_W, 4);

  // ── Archetype label ──────────────────────────────────────────────────────
  let yPos = 160; // More top breathing room in 9:16

  if (data.archetype) {
    ctx.font = '600 22px "Cinzel", serif';
    ctx.fillStyle = 'rgba(101,67,33,0.45)';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText(data.archetype.toUpperCase(), CARD_W / 2, yPos);
    yPos += 40;
  }

  // ── Subtitle line ────────────────────────────────────────────────────────
  ctx.font = '18px "Cinzel", serif';
  ctx.fillStyle = 'rgba(139,90,43,0.3)';
  ctx.letterSpacing = '4px';
  ctx.fillText('✦  DOUAY-RHEIMS  ·  PADRE PIO  ✦', CARD_W / 2, yPos);
  ctx.letterSpacing = '0px';
  yPos += 110; // More vertical space before prayer body

  // ── Prayer text (main body) ──────────────────────────────────────────────
  // FOOTER_RESERVE: space below prayer block for divider + scripture ref + verse + footer
  const FOOTER_RESERVE = 560;
  const MAX_PRAYER_HEIGHT = CARD_H - yPos - FOOTER_RESERVE;

  // Auto-scale font down if prayer is very long so nothing gets cut off
  let prayerFontSize = 46;
  let lineHeight = 76;
  let prayerLines: string[];

  while (prayerFontSize >= 32) {
    ctx.font = `italic ${prayerFontSize}px "EB Garamond", Georgia, "Times New Roman", serif`;
    prayerLines = wrapText(ctx, `\u201C${data.devotionalText}\u201D`, CARD_W - 160);
    if (prayerLines.length * lineHeight <= MAX_PRAYER_HEIGHT) break;
    prayerFontSize -= 4;
    lineHeight = Math.round(prayerFontSize * 1.65);
  }

  ctx.font = `italic ${prayerFontSize}px "EB Garamond", Georgia, "Times New Roman", serif`;
  ctx.fillStyle = '#3d2b1a';
  ctx.textAlign = 'center';

  const prayerBlockHeight = prayerLines!.length * lineHeight;
  // Vertically centre the prayer block in the available space
  const prayerStartY = yPos + Math.max(0, (MAX_PRAYER_HEIGHT - prayerBlockHeight) / 2);

  for (let i = 0; i < prayerLines!.length; i++) {
    ctx.fillText(prayerLines![i], CARD_W / 2, prayerStartY + i * lineHeight);
  }

  // ── Cross divider ───────────────────────────────────────────────────────
  const dividerY = prayerStartY + prayerBlockHeight + 80;

  // Left line
  const lineGrad1 = ctx.createLinearGradient(CARD_W * 0.15, 0, CARD_W * 0.45, 0);
  lineGrad1.addColorStop(0, 'transparent');
  lineGrad1.addColorStop(1, 'rgba(139,90,43,0.25)');
  ctx.fillStyle = lineGrad1;
  ctx.fillRect(CARD_W * 0.15, dividerY, CARD_W * 0.3, 1.5);

  // Cross symbol
  ctx.font = '32px serif';
  ctx.fillStyle = 'rgba(139,90,43,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('✝', CARD_W / 2, dividerY + 12);

  // Right line
  const lineGrad2 = ctx.createLinearGradient(CARD_W * 0.55, 0, CARD_W * 0.85, 0);
  lineGrad2.addColorStop(0, 'rgba(139,90,43,0.25)');
  lineGrad2.addColorStop(1, 'transparent');
  ctx.fillStyle = lineGrad2;
  ctx.fillRect(CARD_W * 0.55, dividerY, CARD_W * 0.3, 1.5);

  // ── Scripture reference ──────────────────────────────────────────────────
  const refY = dividerY + 70;
  ctx.font = '700 26px "Cinzel", serif';
  ctx.fillStyle = 'rgba(101,67,33,0.7)';
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'center';
  ctx.fillText(data.scriptureReference.toUpperCase(), CARD_W / 2, refY);
  ctx.letterSpacing = '0px';

  // Scripture text
  const scriptY = refY + 50;
  ctx.font = 'italic 32px "EB Garamond", Georgia, serif';
  ctx.fillStyle = 'rgba(101,67,33,0.55)';
  const scriptLines = wrapText(ctx, data.scriptureText, CARD_W - 200);
  for (let i = 0; i < scriptLines.length; i++) {
    ctx.fillText(scriptLines[i], CARD_W / 2, scriptY + i * 50);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  ctx.font = '18px "Cinzel", serif';
  ctx.fillStyle = 'rgba(139,90,43,0.25)';
  ctx.letterSpacing = '6px';
  ctx.textAlign = 'center';
  ctx.fillText('PADRE PIO  ·  PRAY, HOPE AND DON\'T WORRY', CARD_W / 2, CARD_H - 80);
  ctx.letterSpacing = '0px';

  return canvas.toDataURL('image/png');
}

/**
 * Download the parchment prayer card as a PNG file.
 */
export function downloadParchmentCard(data: ParchmentCardData): void {
  const dataUrl = generateParchmentImage(data);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'padre-pio-prayer.png';
  a.click();
}
