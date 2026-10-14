import { expect, test as setup } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, storageStateOf, type Role } from "./accounts";

// Una sesión por rol, iniciada por la API: el formulario de login ya tiene su
// propio recorrido y repetirlo en cada prueba solo la haría más lenta.
for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`sesión de ${role}`, async ({ request }) => {
    const response = await request.post("/api/v1/auth/login", {
      data: { email: ACCOUNTS[role].email, password: DEMO_PASSWORD },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    await request.storageState({ path: storageStateOf(role) });
  });
}
