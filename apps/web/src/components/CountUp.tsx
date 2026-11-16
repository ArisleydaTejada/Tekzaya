import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const DURATION_MS = 700;

/** Solo se anima una cifra simple ("42", "4.5", "11h", "90%"); "1.234" o "USD 1,200" se muestran tal cual. */
const SIMPLE = /^(\d+)(?:\.(\d{1,2}))?(?!\d|[.,]\d)(.*)$/s;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Cuenta desde la cifra anterior (o 0 al aparecer) hasta la nueva; lo que no sea un número simple se devuelve igual. */
export function useCountUp(text: string): string {
  const reduced = useReducedMotion();
  const match = SIMPLE.exec(text);
  const target = match ? Number(`${match[1]}${match[2] ? `.${match[2]}` : ""}`) : null;
  const decimals = match?.[2]?.length ?? 0;
  const suffix = match?.[3] ?? "";
  const [shown, setShown] = useState<number | null>(reduced ? target : 0);
  const from = useRef(0);

  useEffect(() => {
    if (target === null || reduced) return;

    const start = performance.now();
    const origin = from.current;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const value = origin + (target - origin) * easeOut(t);

      from.current = value;
      setShown(value);

      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  if (target === null || reduced || shown === null) return text;

  return `${shown.toFixed(decimals)}${suffix}`;
}

/** Para texto normal: el lector de pantalla lee el valor final, no los pasos intermedios. */
export function CountUp({ text }: { text: string }) {
  const animated = useCountUp(text);

  if (animated === text) return <>{text}</>;

  return (
    <>
      <span aria-hidden="true">{animated}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
