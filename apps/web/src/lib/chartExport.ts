/**
 * PNG de una gráfica (spec §7.8.8). Recharts dibuja el trazo en SVG, pero la leyenda y
 * el total del centro de la semidona son HTML: copiar solo el `<svg>` los dejaba fuera,
 * y las etiquetas que asoman del borde salían cortadas. Aquí se compone el bloque
 * entero en un lienzo al doble de resolución: cada SVG en su sitio (con sitio para lo
 * que asoma) y encima el texto y los puntos de color del HTML, con su fuente y su color.
 * Sin `html2canvas`, que rasterizaría el DOM entero para una copia peor de algo ya vectorial.
 */
export async function downloadChartPng(container: HTMLElement, filename: string): Promise<void> {
  const svgs = topLevelSvgs(container);

  if (svgs.length === 0) throw new Error("Esta gráfica no es una imagen que se pueda descargar");

  const root = getComputedStyle(document.documentElement);
  const ink = root.getPropertyValue("--content-ink").trim();
  const surface = root.getPropertyValue("--content-surface").trim();

  // Las etiquetas de valor y de eje pueden asomar fuera del SVG: la imagen abarca el
  // bloque y todo lo que dibuja cada SVG, más un pequeño margen.
  const margin = 8;
  const box = container.getBoundingClientRect();

  const placed = svgs
    .map((svg) => ({ svg, rect: svg.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .map((item) => ({ ...item, extent: extentOf(item.svg, item.rect) }));

  const left = Math.min(box.left, ...placed.map((item) => item.extent.left)) - margin;
  const top = Math.min(box.top, ...placed.map((item) => item.extent.top)) - margin;
  const right = Math.max(box.left + container.scrollWidth, box.right, ...placed.map((item) => item.extent.right)) + margin;
  const bottom = Math.max(box.top + container.scrollHeight, box.bottom, ...placed.map((item) => item.extent.bottom)) + margin;
  const width = right - left;
  const height = bottom - top;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("El navegador no puede generar la imagen");

  context.scale(scale, scale);

  // Fondo opaco: un PNG transparente se ve ilegible pegado en un documento claro.
  context.fillStyle = surface || "#ffffff";
  context.fillRect(0, 0, width, height);

  for (const { svg, rect, extent } of placed) {
    const image = await svgImage(svg, rect, extent, ink);
    context.drawImage(image, extent.left - left, extent.top - top, extent.right - extent.left, extent.bottom - extent.top);
  }

  drawHtml(context, container, left, top);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${slug(filename)}.png`;
  link.click();
}

interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Lo que ocupa en pantalla todo lo que dibuja el SVG, incluido lo que asoma de su caja. */
function extentOf(svg: SVGSVGElement, rect: DOMRect): Extent {
  const base = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  let content: DOMRect;

  try {
    content = svg.getBBox();
  } catch {
    return base;
  }

  const view = svg.viewBox.baseVal;
  const hasView = view && view.width > 0 && view.height > 0;
  const scaleX = hasView ? rect.width / view.width : 1;
  const scaleY = hasView ? rect.height / view.height : 1;
  const originX = hasView ? view.x : 0;
  const originY = hasView ? view.y : 0;

  return {
    left: Math.min(base.left, rect.left + (content.x - originX) * scaleX),
    top: Math.min(base.top, rect.top + (content.y - originY) * scaleY),
    right: Math.max(base.right, rect.left + (content.x + content.width - originX) * scaleX),
    bottom: Math.max(base.bottom, rect.top + (content.y + content.height - originY) * scaleY),
  };
}

/** Los SVG del bloque que no están dentro de otro SVG ni del tooltip. */
function topLevelSvgs(container: HTMLElement): SVGSVGElement[] {
  return Array.from(container.querySelectorAll("svg")).filter(
    (svg) => !svg.parentElement?.closest("svg") && !svg.closest(".recharts-tooltip-wrapper"),
  );
}

/** Copia el SVG, con sitio para lo que asoma de su caja, y lo carga como imagen. */
async function svgImage(svg: SVGSVGElement, rect: DOMRect, extent: Extent, ink: string): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true);

  if (!(clone instanceof SVGSVGElement)) throw new Error("Esta gráfica no es una imagen que se pueda descargar");

  // La copia va dentro de un SVG más grande, desplazada hasta su sitio: así conserva su
  // propio `viewBox` (los iconos de la leyenda dibujan en 32×32) y lo que asoma se ve.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const frame = document.createElementNS(SVG_NS, "svg");
  frame.setAttribute("xmlns", SVG_NS);
  frame.setAttribute("width", String(extent.right - extent.left));
  frame.setAttribute("height", String(extent.bottom - extent.top));
  clone.setAttribute("x", String(rect.left - extent.left));
  clone.setAttribute("y", String(rect.top - extent.top));
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.setAttribute("overflow", "visible");
  clone.style.overflow = "visible";
  frame.appendChild(clone);

  // El SVG suelto no hereda las variables ni las fuentes de la página: el color y la
  // letra de cada texto se fijan con lo que se ve en pantalla.
  const originals = Array.from(svg.querySelectorAll("text"));
  Array.from(clone.querySelectorAll("text")).forEach((text, index) => {
    const style = originals[index] ? getComputedStyle(originals[index]) : null;

    if (!text.getAttribute("fill") || text.getAttribute("fill")?.includes("var(")) {
      text.setAttribute("fill", style?.fill && style.fill !== "none" ? style.fill : ink);
    }

    if (style) {
      text.setAttribute("font-family", style.fontFamily);
      text.setAttribute("font-size", style.fontSize);
      text.setAttribute("font-weight", style.fontWeight);
    }
  });

  const source = new XMLSerializer().serializeToString(frame);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo convertir la gráfica"));
      image.src = url;
    });
  } finally {
    // La imagen ya está decodificada; el lienzo la dibuja después sin la URL.
    queueMicrotask(() => URL.revokeObjectURL(url));
  }

  return image;
}

/** El HTML del bloque fuera de los SVG: puntos de color y textos, en su posición. */
function drawHtml(context: CanvasRenderingContext2D, container: HTMLElement, originX: number, originY: number) {
  const skip = (element: Element) =>
    Boolean(element.closest("svg") || element.closest(".recharts-tooltip-wrapper") || element.closest(".sr-only"));

  // Fondos de color (los puntos de la leyenda y las barras de distribución).
  for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
    if (skip(element)) continue;
    const style = getComputedStyle(element);

    if (style.visibility === "hidden" || style.display === "none") continue;
    const background = style.backgroundColor;

    if (!background || background === "transparent" || /rgba\(.*,\s*0\)$/.test(background)) continue;
    const rect = element.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) continue;
    context.fillStyle = background;
    const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2);
    context.beginPath();
    context.roundRect(rect.left - originX, rect.top - originY, rect.width, rect.height, radius);
    context.fill();
  }

  // Textos, línea a línea tal como los partió el navegador.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent ?? "";

    if (!parent || skip(parent) || !text.trim()) continue;
    const style = getComputedStyle(parent);

    if (style.visibility === "hidden" || style.opacity === "0") continue;

    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fillStyle = style.color;
    context.textBaseline = "middle";
    context.textAlign = "left";

    if (!(node instanceof Text)) continue;

    for (const line of linesOf(node, range)) {
      const shown = style.textTransform === "uppercase" ? line.text.toUpperCase() : line.text;
      context.fillText(shown, line.rect.left - originX, line.rect.top - originY + line.rect.height / 2);
    }
  }

  range.detach();
}

/** Parte un nodo de texto en las líneas en que lo dibujó el navegador. */
function linesOf(node: Text, range: Range): { text: string; rect: DOMRect }[] {
  const text = node.textContent ?? "";
  const lines: { text: string; rect: DOMRect }[] = [];
  let start = 0;
  let top: number | null = null;

  for (let index = 0; index < text.length; index++) {
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) continue;

    if (top !== null && Math.abs(rect.top - top) > rect.height / 2) {
      pushLine(node, range, start, index, lines);
      start = index;
    }

    top = rect.top;
  }

  pushLine(node, range, start, text.length, lines);

  return lines;
}

function pushLine(node: Text, range: Range, start: number, end: number, lines: { text: string; rect: DOMRect }[]) {
  const text = (node.textContent ?? "").slice(start, end);

  if (!text.trim()) return;
  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0) return;
  // Se mide sin los espacios del principio para que el texto caiga donde se ve.
  const leading = text.length - text.trimStart().length;

  if (leading) {
    range.setStart(node, start + leading);
    lines.push({ text: text.trim(), rect: range.getBoundingClientRect() });
  } else {
    lines.push({ text: text.trimEnd(), rect });
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
