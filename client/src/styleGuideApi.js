const lookReferences = [
  {
    title: "Winter layering",
    description: "Insulating layers and grounded cold-weather textures.",
    image: "/photos/Winter%20outfit%20under%20budget.jpg",
    keywords: ["winter", "cozy", "warm", "layer", "cold"],
  },
  {
    title: "Oversized streetwear",
    description: "Relaxed proportions with a confident city silhouette.",
    image: "/photos/Oversized%20Streetwear%20Outfit%20for%20Men%20_%20Baggy%20Fashion%20Inspiration.jpg",
    keywords: ["streetwear", "oversized", "baggy", "urban", "skater"],
  },
  {
    title: "Autumn tones",
    description: "Earthy color, tactile knits, and easy seasonal layers.",
    image: "/photos/Autumn%20Fits.jpg",
    keywords: ["autumn", "fall", "earth", "rust", "seasonal", "tailoring"],
  },
  {
    title: "Everyday editorial",
    description: "An expressive mix of casual pieces and considered details.",
    image: "/photos/leeyjohn_%20IG%20fits.jpg",
    keywords: ["editorial", "casual", "minimal", "everyday", "street"],
  },
  {
    title: "Soft romantic",
    description: "Fluid shapes and delicate details with a modern feel.",
    image: "/photos/xiaoxiao%20outfits%E2%80%99.jpg",
    keywords: ["romantic", "feminine", "soft", "delicate", "minimalism"],
  },
];

const paletteProfiles = [
  {
    matches: ["winter", "cozy", "warm", "layer", "cold"],
    colors: [
      { name: "Oxblood", value: "#681219" },
      { name: "Stone", value: "#b0919f" },
      { name: "Espresso", value: "#3f0b12" },
      { name: "Rosewood", value: "#7d4949" },
    ],
  },
  {
    matches: ["autumn", "fall", "earth", "rust", "tailoring"],
    colors: [
      { name: "Clay", value: "#7d4949" },
      { name: "Coffee", value: "#714a39" },
      { name: "Mauve", value: "#b0919f" },
      { name: "Cherry", value: "#681219" },
    ],
  },
  {
    matches: ["streetwear", "oversized", "baggy", "urban", "skater", "street"],
    colors: [
      { name: "Cherry", value: "#681219" },
      { name: "Ink", value: "#1d0d12" },
      { name: "Concrete", value: "#b0919f" },
      { name: "Wine", value: "#3f0b12" },
    ],
  },
];

// Mock backend response; replace this body with the style-guide API request when available.
export async function requestStyleMoodboard(stylePrompt) {
  const prompt = stylePrompt.trim();
  if (!prompt) throw new Error("Describe a style to build a moodboard.");

  await new Promise((resolve) => window.setTimeout(resolve, 350));

  const normalizedPrompt = prompt.toLowerCase();
  const matchedLooks = lookReferences.filter((look) =>
    look.keywords.some((keyword) => normalizedPrompt.includes(keyword)),
  );
  const paletteProfile = paletteProfiles.find((profile) =>
    profile.matches.some((keyword) => normalizedPrompt.includes(keyword)),
  );
  const ignoredKeywords = new Set(["a", "an", "and", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);
  const keywords = [...new Set(normalizedPrompt.match(/[a-z0-9]+/g) || [])]
    .filter((keyword) => !ignoredKeywords.has(keyword))
    .slice(0, 5);

  return {
    title: `${prompt} Moodboard`,
    summary: `A visual direction for ${prompt}, with curated silhouettes, textures, and colors.`,
    keywords: keywords.length ? keywords : ["personal style"],
    palette: paletteProfile?.colors || [
      { name: "Cherry", value: "#681219" },
      { name: "Stone", value: "#b0919f" },
      { name: "Coffee", value: "#714a39" },
      { name: "Rosewood", value: "#7d4949" },
    ],
    looks: matchedLooks.length ? matchedLooks.slice(0, 4) : lookReferences.slice(0, 4),
  };
}