import sharp from 'sharp';
import type { StyleListing } from './types';

const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const palettes: Record<string, [string, string, string]> = {
  luxury: ['#eae5d7', '#333b25', '#b1a784'],
  street: ['#203fe5', '#f4ff6b', '#677bff'],
  pastel: ['#f4cadc', '#843e50', '#f8e696'],
  cinema: ['#191c20', '#f0ece4', '#823638'],
  meme: ['#d4ef63', '#23291c', '#9dba40'],
  organic: ['#dbe1d1', '#304b37', '#abb895'],
};

export async function renderMockImage({
  inputImage,
  buyerBrief,
  brandName,
  styleListing,
}: {
  inputImage: Buffer | null;
  buyerBrief: string;
  brandName: string;
  styleListing: StyleListing;
}) {
  const [bg, ink, accent] = palettes[styleListing.palette] || palettes.luxury;
  const title = escapeXml((brandName || 'A new perspective').slice(0, 35));
  const brief =
    buyerBrief
      .replace(/\s+/g, ' ')
      .match(/.{1,55}(?:\s|$)|.{1,55}/g)
      ?.slice(0, 2) || [];
  const serif = ['luxury', 'organic'].includes(styleListing.palette);
  const base = Buffer.from(
    `<svg width="1024" height="1280" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1280" fill="${bg}"/><circle cx="920" cy="380" r="300" fill="${accent}" opacity=".45"/><rect x="44" y="44" width="936" height="1192" fill="none" stroke="${ink}" opacity=".25"/><g fill="${ink}" font-family="sans-serif"><text x="76" y="101" font-size="18" letter-spacing="5">${escapeXml(styleListing.name.toUpperCase())}</text><text x="76" y="214" font-size="${title.length > 25 ? 48 : 66}" font-family="${serif ? 'Georgia,serif' : 'sans-serif'}" font-weight="${serif ? 400 : 800}">${title}</text>${brief.map((line, i) => `<text x="76" y="${1090 + i * 35}" font-size="23">${escapeXml(line.trim())}</text>`).join('')}<text x="76" y="1190" font-size="15" letter-spacing="3">CREATIVE DIRECTION / ${escapeXml(styleListing.seller.handle.toUpperCase())}</text><text x="948" y="1190" text-anchor="end" font-size="15">01 — TM</text></g></svg>`,
  );
  const abstract = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="808" height="730"><circle cx="404" cy="350" r="210" fill="${accent}"/><rect x="242" y="165" width="324" height="400" rx="160" fill="${ink}" opacity=".18"/><circle cx="460" cy="300" r="108" fill="${bg}"/><path d="M130 555 Q404 90 678 555" fill="none" stroke="${ink}" stroke-width="3" opacity=".4"/><text x="404" y="685" text-anchor="middle" font-family="sans-serif" font-size="15" letter-spacing="4" fill="${ink}">TEXT TO IMAGE / DEMO COMPOSITION</text></svg>`,
  );
  const product = await sharp(inputImage || abstract)
    .resize(808, 730, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: product, top: 280, left: 108 }])
    .png()
    .toBuffer();
}
