function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: string, filename: string) {
  triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export async function downloadSvgAsPng(svg: string, filename: string) {
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("The image has no drawable area.");
    const scale = Math.min(2, 16000 / width, 16000 / height, Math.sqrt(32_000_000 / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the PNG image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The PNG image could not be created.")), "image/png"));
    triggerDownload(png, filename);
  } finally {
    URL.revokeObjectURL(source);
  }
}
