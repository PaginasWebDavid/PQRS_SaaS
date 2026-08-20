import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Prueba estructural, no de comportamiento.
//
// EL FALLO QUE ESTA PRUEBA IMPIDE
//
// `src/middleware.ts` decide si el onboarding esta completo leyendo la COOKIE
// de sesion con `getToken()`. `getToken()` descifra la cookie tal cual: NO
// ejecuta el callback `jwt` y por tanto NO vuelve a consultar la base de datos.
//
// Consecuencia: una pantalla puede escribir `onboardingCompletedAt` en la base
// correctamente y aun asi dejar al usuario atrapado. Al navegar, el middleware
// lee la cookie vieja, ve que falta el onboarding y lo devuelve a la misma
// pantalla. Desde fuera se ve como un boton que "no hace nada", que es
// exactamente como se reporto: el ultimo paso del onboarding del residente no
// dejaba entrar a la aplicacion por mas que se oprimiera.
//
// La cura es reemitir el token con `update()` de next-auth ANTES de navegar.
// Eso si dispara el callback `jwt`, que en este proyecto siempre relee la
// membresia (`getUserMembershipContext`), asi que la cookie nueva ya trae el
// dato correcto.
//
// `/seleccionar-conjunto` ya lo hacia bien; los dos onboardings no. Esta prueba
// recorre el arbol en vez de revisar una lista fija, de modo que una pantalla
// nueva que cambie el estado de sesion queda cubierta sin que nadie se acuerde
// de agregarla aqui.

const APP_ROOT = join(process.cwd(), "src", "app");

// Endpoints que modifican algo que el middleware despues lee de la cookie.
// Si se agrega otro, agregarlo aqui: el coste de olvidarlo es un usuario
// atrapado en un bucle de redirecciones sin ningun mensaje de error.
const ENDPOINTS_QUE_CAMBIAN_LA_SESION = [
  "/api/onboarding",
  "/api/me/tenant",
] as const;

function archivosDePagina(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosDePagina(ruta));
    } else if (entrada === "page.tsx") {
      salida.push(ruta);
    }
  }
  return salida;
}

test("toda pantalla que cambia el estado de sesion lo reemite antes de navegar", () => {
  const incumplen: string[] = [];

  for (const archivo of archivosDePagina(APP_ROOT)) {
    const fuente = readFileSync(archivo, "utf8");
    const llamaEndpointDeSesion = ENDPOINTS_QUE_CAMBIAN_LA_SESION.some((e) =>
      fuente.includes(e)
    );
    if (!llamaEndpointDeSesion) continue;

    // No basta con importar useSession: hay que invocar update().
    const reemite = /\bupdate\s*(?::\s*\w+\s*)?\}/.test(fuente)
      ? /await\s+\w*[Rr]efrescarSesion\s*\(\)|await\s+update\s*\(\)/.test(fuente)
      : false;

    if (!reemite) {
      incumplen.push(relative(process.cwd(), archivo).split(sep).join("/"));
    }
  }

  assert.deepEqual(
    incumplen,
    [],
    "Estas pantallas escriben algo que el middleware lee de la cookie de sesion, " +
      "pero no llaman a update() de next-auth antes de navegar. El usuario " +
      "quedara atrapado: el middleware leera la cookie vieja y lo devolvera a " +
      "la misma pantalla, sin ningun mensaje de error.\n  " +
      incumplen.join("\n  ")
  );
});

test("el middleware sigue leyendo la cookie, que es lo que hace necesaria la regla", () => {
  const middleware = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");

  // Si algun dia el middleware pasa a consultar la base de datos, la regla de
  // arriba deja de ser necesaria y esta prueba debe revisarse en vez de
  // arrastrarse por inercia.
  assert.ok(
    middleware.includes("getToken("),
    "El middleware ya no usa getToken(). Revisar si sigue haciendo falta " +
      "reemitir el token antes de navegar, o si esta prueba quedo obsoleta."
  );
  assert.ok(
    middleware.includes("onboardingCompletedAt"),
    "El middleware ya no controla el onboarding. Revisar esta prueba."
  );
});
