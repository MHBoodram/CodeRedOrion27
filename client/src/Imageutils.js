// Downscales a data-URL photo and returns raw base64 (no "data:" prefix) for the analyze endpoint.
// Keeps uploads small: serverless hosts cap request bodies at a few MB.
export function prepareImageForUpload(dataUrl, maxSize = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not process that image."));
        return;
      }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const output = canvas.toDataURL("image/jpeg", quality);
      resolve({ image: output.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Could not read that image. Please try another photo."));
    img.src = dataUrl;
  });
}
 