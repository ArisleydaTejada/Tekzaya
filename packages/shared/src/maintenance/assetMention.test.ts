import { describe, expect, it } from "vitest";
import { detectAssetType, mentionedAssetNumber } from "./assetMention";

describe("¿de qué equipo habla el ticket?", () => {
  it("reconoce el equipo sin importar mayúsculas ni tildes", () => {
    expect(detectAssetType("La IMPRESORA de Ventas no saca hojas")).toBe("printer");
    expect(detectAssetType("Mi portátil no enciende")).toBe("laptop");
    expect(detectAssetType("No hay conexión", "Se cayó el Wi-Fi del piso 2")).toBe("network");
  });

  it("el nombre del equipo pesa más que una pista", () => {
    expect(detectAssetType("Se rompió la pantalla de mi laptop")).toBe("laptop");
    expect(detectAssetType("No puedo imprimir", "el monitor parpadea también")).toBe("monitor");
  });

  it("a igual peso gana lo que aparece antes, y el título va primero", () => {
    expect(detectAssetType("La laptop no imprime en la impresora")).toBe("laptop");
    expect(detectAssetType("El monitor parpadea", "y la laptop va lenta")).toBe("monitor");
  });

  it("solo casan palabras enteras", () => {
    expect(detectAssetType("Necesito redactar un informe con el lapiz")).toBeNull();
    expect(detectAssetType("Revisar el aire acondicionado")).toBe("air_conditioner");
  });

  it("sin mención de un equipo no adivina", () => {
    expect(detectAssetType("No puedo entrar al sistema de nómina")).toBeNull();
  });

  it("lee el número del equipo si se escribe", () => {
    expect(mentionedAssetNumber("Falla en ACT-0012 otra vez")).toBe(12);
    expect(mentionedAssetNumber("act12 no arranca")).toBe(12);
    expect(mentionedAssetNumber("Nada que ver")).toBeNull();
  });
});
