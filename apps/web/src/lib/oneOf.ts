/**
 * Valor de un control como uno de los conocidos, o `undefined`. Sustituye a `value as Tipo`:
 * el tipo sale de comprobarlo, no de suponerlo.
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
