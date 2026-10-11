const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const ignoredSearchTerms = new Set([
  "a", "an", "and", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
  "baggy", "cozy", "fashion", "inspiration", "layer", "layers", "layering", "look", "outfit", "oversized", "relaxed", "soft", "style", "warm",
]);
const clothingPattern = /\b(apparel|clothes|clothing|garment|garments|outfit|outfits|dress|dresses|gown|gowns|shirt|shirts|blouse|blouses|top|tops|coat|coats|jacket|jackets|trousers|pants|jeans|skirt|skirts|sweater|sweaters|cardigan|cardigans|hoodie|hoodies|suit|suits|uniform|uniforms|shoes|boots|footwear|hat|hats|scarf|scarves|gloves|belt|belts|accessories|wear)\b/i;
const garmentEvidencePattern = /\b(dress|dresses|gown|gowns|shirt|shirts|blouse|blouses|top|tops|coat|coats|jacket|jackets|trousers|pants|jeans|skirt|skirts|sweater|sweaters|cardigan|cardigans|hoodie|hoodies|suit|suits|uniform|uniforms|shoes|boots|footwear|hat|hats|scarf|scarves|gloves|belt|belts|wearing|worn)\b/i;
const personEvidencePattern = /\b(person|people|man|men|woman|women|model|models|portrait|portraits|wearing)\b/i;
const fullLengthPortraitPattern = /\bportrait photographs? of .+ at full length\b/i;
const multiplePeoplePattern = /\b(group|crowd|family|couple|duo|twins|two people|multiple people|children|fashion show|runway)\b|\bwith (?:his|her|their|a) child\b/i;
const artworkPattern = /\b(paintings?|painted|drawings?|illustrations?|sculptures?|artworks?)\b/i;
const buildingPattern = /\b(buildings?|architecture|architectural|storefronts?|facades?|skyscrapers?|houses?|shops?|stores?|streets?|cityscape|skyline|landmarks?)\b/i;
const logoPattern = /\b(logos?|logotypes?|wordmarks?|brandmarks?|brand identity)\b/i;

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

function getPlainText(value) {
  if (typeof value !== "string") return "";
  return new DOMParser().parseFromString(value, "text/html").body.textContent?.trim() || "";
}

async function searchStyleImages(prompt) {
  const styleTerms = (prompt.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((term) => !ignoredSearchTerms.has(term))
    .slice(0, 2);
  const searchTerms = styleTerms.join(" ") || prompt;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${searchTerms} clothing filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "50",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`${WIKIMEDIA_API}?${params}`);
  if (!response.ok) {
    throw new Error("Could not load style photos. Please try again.");
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.info || "Could not load style photos. Please try again.");
  }

  const candidates = Object.values(data.query?.pages || {})
    .sort((left, right) => left.index - right.index)
    .flatMap((page) => {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo?.thumburl) return [];

      const metadata = imageInfo.extmetadata || {};
      const description = getPlainText(metadata.ImageDescription?.value);
      const categories = getPlainText(metadata.Categories?.value);
      const imageText = `${page.title} ${description} ${categories}`;
      const portraitCategory = categories
        .split("|")
        .find((category) => fullLengthPortraitPattern.test(category));
      const isBuildingOnly = buildingPattern.test(imageText)
        && !garmentEvidencePattern.test(imageText)
        && !personEvidencePattern.test(imageText);
      if (
        !clothingPattern.test(imageText)
        || multiplePeoplePattern.test(imageText)
        || artworkPattern.test(imageText)
        || isBuildingOnly
        || logoPattern.test(imageText)
      ) return [];

      return [{
        title: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, "").replaceAll("_", " "),
        description: portraitCategory
          ? `${portraitCategory.replace(/^Portrait photographs? of /i, "").replace(/ at full length$/i, "")} — full-length clothing inspiration.`
          : "Clothing style inspiration.",
        image: imageInfo.thumburl,
        sourceUrl: imageInfo.descriptionurl,
        artist: getPlainText(metadata.Artist?.value),
        licenseName: metadata.LicenseShortName?.value || metadata.UsageTerms?.value,
        licenseUrl: metadata.LicenseUrl?.value || imageInfo.descriptionurl,
      }];
    });

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
  }
  const looks = candidates.slice(0, 4);

  if (!looks.length) {
    throw new Error("No matching clothing photos were found. Try a different description.");
  }
  return looks;
}

// Build a moodboard from the prompt and free, openly licensed Wikimedia Commons images.
export async function requestStyleMoodboard(stylePrompt) {
  const prompt = stylePrompt.trim();
  if (!prompt) throw new Error("Describe a style to build a moodboard.");

  const normalizedPrompt = prompt.toLowerCase();
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
    looks: await searchStyleImages(prompt),
  };
}
