// Shrinks a data-URL photo to a small JPEG preview (default longest edge 256px) for the Past Fits history.
// Resolves to null on any failure: a missing thumbnail must never block an analysis.
export function makeThumbnail(dataUrl, maxEdge = 256, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return resolve(null);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out.length <= 80000 ? out : null); // server rejects anything over 80,000 chars
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}