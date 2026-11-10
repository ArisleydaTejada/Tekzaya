/**
 * El valor de un control (`<select>`, un id de arrastre, una clave) como uno de los
 * valores conocidos, o `undefined` si no lo es. Sustituye a `value as Tipo`: el tipo
 * sale de comprobarlo contra la lista, no de suponerlo.
 */
export function oneOf<T extends string>(options: readonly T[], value: string | number | null | undefined): T | undefined {
  return options.find((option) => option === value);
}

/** Lo mismo para una selección múltiple: se quedan los conocidos, en el orden elegido. */
export function allOf<T extends string>(options: readonly T[], values: readonly string[]): T[] {
  return values.flatMap((value) => {
    const known = oneOf(options, value);

    return known === undefined ? [] : [known];
  });
}
