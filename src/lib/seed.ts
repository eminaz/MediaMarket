// Optional seller-level seed overrides. Existing installations can use SELLER_PAYOUT_ADDRESSES.
export const seedPayoutAddresses: Record<string, string> = {};
export const seeds = [
  // Keep image seeds first so existing curated artwork remains unchanged.
  {
    id: 'luxury-product-ad',
    name: 'Luxury Product Ad',
    handle: 'studio.aure',
    displayName: 'Studio Auré',
    description:
      'Turn an everyday object into an object of desire. Sculptural light, rich textures, and considered typography give your product the campaign it deserves.',
    tags: ['luxury', 'minimal', 'product'],
    priceUsdc: 2.5,
    etaSeconds: 45,
    palette: 'luxury',
    sample: 'luxury.jpg',
    summary: 'Quiet luxury. Sculptural light. Unmistakably yours.',
    prompt:
      'Create an elegant luxury product campaign. Warm ivory and olive palette, architectural plinth, dramatic natural shadows, refined serif typography, generous negative space. Preserve the product identity.',
  },
  {
    id: 'streetwear-hype',
    name: 'Streetwear Hype',
    handle: 'offgrid',
    displayName: 'Offgrid Studio',
    description:
      'Built for the next drop. Bold editorial type, electric color, and street-level energy make a launch impossible to scroll past.',
    tags: ['streetwear', 'bold', 'hype'],
    priceUsdc: 1.8,
    etaSeconds: 30,
    palette: 'street',
    sample: 'street.jpg',
    summary: 'Big type. Raw energy. Drop-ready.',
    prompt:
      'Create a streetwear campaign: saturated electric blue, acid yellow bold condensed lettering, dynamic diagonal composition, gritty texture and high contrast. Keep the product recognizable.',
  },
  {
    id: 'cute-pastel-promo',
    name: 'Cute Pastel Promo',
    handle: 'peach.club',
    displayName: 'Peach Club',
    description:
      'A little joy goes a long way. Dreamy pastel color, soft shapes, and playful art direction turn your product into a tiny daily obsession.',
    tags: ['pastel', 'cute', 'playful'],
    priceUsdc: 1.5,
    etaSeconds: 25,
    palette: 'pastel',
    sample: 'pastel.jpg',
    summary: 'Soft colors. Big feelings. A little extra sweet.',
    prompt:
      'Create a playful pastel product promotion. Blush pink and butter yellow, soft studio lighting, rounded shapes, whimsical friendly typography. Preserve the uploaded subject.',
  },
  {
    id: 'dark-cinematic-poster',
    name: 'Dark Cinematic Poster',
    handle: 'afterhours',
    displayName: 'After Hours',
    description:
      'Make your next release feel like an opening night. Moody light, deep shadows, and cinematic framing give any subject a story worth watching.',
    tags: ['cinematic', 'dark', 'dramatic'],
    priceUsdc: 3.2,
    etaSeconds: 60,
    palette: 'cinema',
    sample: 'cinema.jpg',
    summary: 'Every product has a story. Make it cinematic.',
    prompt:
      'Create a dark cinematic poster: deep charcoal, dramatic red rim lighting, atmospheric haze, widescreen-inspired composition, restrained credits and compelling title. Preserve the subject.',
  },
  {
    id: 'meme-launch-graphic',
    name: 'Meme Launch Graphic',
    handle: 'intern.exe',
    displayName: 'Intern.exe',
    description:
      'Less corporate. More internet. A knowing wink, oversized type, and perfectly unserious energy for launches that want to be shared.',
    tags: ['meme', 'funny', 'viral'],
    priceUsdc: 0.75,
    etaSeconds: 15,
    palette: 'meme',
    sample: 'meme.jpg',
    summary: 'Chronically online. Creatively unhinged.',
    prompt:
      'Create an internet-native meme launch graphic. Acid green backdrop, intentionally oversized black type, irreverent visual humor, playful sticker composition. Incorporate the product and the buyer brief.',
  },
  {
    id: 'botanical-editorial',
    name: 'Botanical Editorial',
    handle: 'studio.aure',
    displayName: 'Studio Auré',
    description:
      'A slower kind of beautiful. Organic forms, earthy greens, and a touch of editorial restraint for brands rooted in something real.',
    tags: ['organic', 'minimal', 'lifestyle'],
    priceUsdc: 2,
    etaSeconds: 35,
    palette: 'organic',
    sample: 'organic.jpg',
    summary: 'Naturally considered. Beautifully understated.',
    prompt:
      'Create a botanical editorial product advertisement. Earthy green, tactile cream paper, organic plant shapes and quiet serif typography. Natural light and deliberate negative space.',
  },
  {
    id: 'luxury-ambient-music',
    type: 'music' as const,
    durationSeconds: 10,
    name: 'Luxury Ambient Music',
    handle: 'studio.aure',
    displayName: 'Studio Auré',
    description:
      'An understated soundtrack for perfume films, product reveals, and quiet brand moments. Warm piano, shimmering textures, and a gentle electronic pulse. A 10-second instrumental WAV, generated for your brief.',
    tags: ['luxury', 'minimal', 'ambient', 'piano'],
    priceUsdc: 2.5,
    etaSeconds: 120,
    palette: 'luxury',
    sample: 'luxury.jpg',
    summary: 'Warm piano. Shimmering textures. A little room to breathe.',
    prompt:
      'Minimal luxury ambient music, warm piano, shimmering textures, gentle electronic pulse, spacious and restrained arrangement, no vocals.',
  },
];
