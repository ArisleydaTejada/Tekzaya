/**
 * PNG de una gráfica (spec §7.8.8): el SVG de Recharts se dibuja en un lienzo al doble de resolución.
 * Sin `html2canvas`, que rasterizaría el DOM entero para una copia peor de algo ya vectorial.
 */
export async function downloadChartPng(container: HTMLElement, filename: string): Promise<void> {
  const svg = container.querySelector("svg");

  if (!svg) throw new Error("Esta gráfica no es una imagen que se pueda descargar");

  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);

  if (!(clone instanceof SVGElement)) throw new Error("Esta gráfica no es una imagen que se pueda descargar");

  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // El SVG incrustado no hereda las variables de CSS; sin fijar aquí el color del tema,
  // los textos saldrían negros sobre fondo oscuro.
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--content-ink").trim();

  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue("--content-surface")
    .trim();

  for (const text of Array.from(clone.querySelectorAll("text"))) {
    if (!text.getAttribute("fill")) text.setAttribute("fill", ink);
  }

  const source = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo convertir la gráfica"));
      image.src = url;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");

    if (!context) throw new Error("El navegador no puede generar la imagen");

    // Fondo opaco: un PNG transparente se ve ilegible pegado en un documento claro.
    context.fillStyle = surface || "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${slug(filename)}.png`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "grafica"
  );
}
