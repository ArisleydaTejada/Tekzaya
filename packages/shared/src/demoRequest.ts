import { z } from "zod";

/**
 * Solicitud de demo desde la página pública. Los dos módulos se venden por
 * separado, así que quien pide dice cuál le interesa.
 */
export const DEMO_MODULES = ["tickets", "maintenance", "both"] as const;
export const demoModule = z.enum(DEMO_MODULES);
export type DemoModule = z.infer<typeof demoModule>;

export const DEMO_MODULE_LABELS: Record<DemoModule, string> = {
  tickets: "Tickets",
  maintenance: "Mantenimiento",
  both: "Tickets + Mantenimiento",
};

export const demoRequestInput = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(120),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Escribe un correo válido")),
  company: z.string().trim().min(2, "Escribe el nombre de tu empresa").max(160),
  module: demoModule,
  message: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
  /**
   * Trampa para robots: el campo está oculto, una persona lo deja vacío. Si
   * llega con algo, la API responde como si nada y no guarda la solicitud.
   */
  website: z.string().max(200).optional(),
});
export type DemoRequestInput = z.infer<typeof demoRequestInput>;

export const demoRequestResponse = z.object({ received: z.literal(true) });
export type DemoRequestResponse = z.infer<typeof demoRequestResponse>;
