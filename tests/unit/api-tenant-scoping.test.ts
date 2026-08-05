import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Prueba estructural, no de comportamiento.
//
// El aislamiento entre conjuntos descansa en una sola regla: el tenantId sale
// SIEMPRE de la sesion autenticada, y el identificador del recurso de la URL.
// El servicio cruza los dos. Si una ruta tomara el tenantId de lo que envia el
// cliente, cualquier administrador podria leer o modificar los datos de otro
// conjunto cambiando un valor en la peticion. Es la unica vulnerabilidad que
// acabaria con el negocio de un dia para otro.
//
// Hoy las 23 rutas dinamicas cumplen la regla. Esta prueba existe para que
// siga siendo cierto en la ruta numero 24, escrita con prisa dentro de seis
// meses. Recorre el arbol de rutas en vez de revisar una lista fija: una ruta
// nueva queda cubierta sin que nadie se acuerde de agregarla aqui.

const API_ROOT = join(process.cwd(), "src", "app", "api");

// Rutas donde recibir un tenant ajeno es la funcion, no el fallo: el Super
// Admin opera sobre cualquier conjunto por definicion. Cada excepcion se
// justifica aqui para que agregar una sea una decision consciente.
const SUPER_ADMIN_ROUTES: readonly string[] = [
  "platform/tenants/[id]/export/route.ts",
];

// NextAuth no es una ruta de dominio: no lee ni escribe datos de conjunto.
const NOT_DOMAIN_ROUTES: readonly string[] = [
  "auth/[...nextauth]/route.ts",
];

function findDynamicRoutes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findDynamicRoutes(full, found);
    } else if (entry === "route.ts" && relative(API_ROOT, full).includes("[")) {
      found.push(relative(API_ROOT, full).split(sep).join("/"));
    }
  }
  return found;
}

// Los comentarios se eliminan antes de analizar: este mismo archivo habla de
// "body.tenantId" al explicarse, y un comentario no ejecuta nada.
function sourceWithoutComments(routePath: string): string {
  return readFileSync(join(API_ROOT, routePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const routes = findDynamicRoutes(API_ROOT).filter(
  (route) => !NOT_DOMAIN_ROUTES.includes(route)
);

test("1. hay rutas dinamicas que revisar", () => {
  // Si el arbol se reorganiza y el descubrimiento deja de encontrar nada, la
  // prueba pasaria vacia y daria una falsa sensacion de seguridad.
  assert.ok(routes.length >= 20, `Solo se encontraron ${routes.length} rutas dinamicas`);
});

// Ayudantes que resuelven el conjunto efectivo validando la sesion. Un
// administrador con varios conjuntos necesita poder indicar sobre cual opera,
// asi que leer un tenantId de la peticion no es malo por si mismo: lo que no
// puede pasar es que ese valor se use sin contrastarlo contra las membresias
// de quien pregunta. Estos ayudantes hacen justamente eso, y para un ADMIN
// normal descartan el valor pedido y devuelven el de su propia sesion.
const TENANT_RESOLVERS = [
  "requireActiveTenantUser",
  "requireTenantRole",
  "getTenantIdFromSession",
  "resolveUserManagementAccess",
  "requireSuperAdminTenantTarget",
];

const RESOLVER_PATTERN = new RegExp(`\\b(${TENANT_RESOLVERS.join("|")})\\s*\\(`);

test("2. el tenantId de la peticion nunca se usa sin validarlo contra la sesion", () => {
  // Formas reales de intentar colar un conjunto ajeno.
  const readsFromRequest = [
    /\bbody\s*\.\s*tenantId\b/,
    /\bbody\s*\[\s*["'`]tenantId["'`]\s*\]/,
    /searchParams\s*\.\s*get\s*\(\s*["'`]tenantId["'`]/,
    /headers\s*\.\s*get\s*\(\s*["'`][^"'`]*tenant[^"'`]*["'`]/i,
  ];

  const offenders: string[] = [];
  for (const route of routes) {
    const source = sourceWithoutComments(route);
    const reads = readsFromRequest.some((pattern) => pattern.test(source));
    if (reads && !RESOLVER_PATTERN.test(source)) offenders.push(route);
  }

  assert.deepEqual(
    offenders,
    [],
    `Estas rutas leen un tenantId de la peticion sin pasarlo por un resolvedor que valide la membresia:\n  ${offenders.join("\n  ")}`
  );
});

test("3. toda ruta de dominio resuelve el conjunto con un ayudante autorizado", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    if (SUPER_ADMIN_ROUTES.includes(route)) continue;
    if (!RESOLVER_PATTERN.test(sourceWithoutComments(route))) offenders.push(route);
  }

  assert.deepEqual(
    offenders,
    [],
    `Estas rutas no resuelven el conjunto con ninguno de los ayudantes conocidos (${TENANT_RESOLVERS.join(", ")}).\nSi agregaste uno nuevo, valida que contraste contra la sesion y anadelo a TENANT_RESOLVERS:\n  ${offenders.join("\n  ")}`
  );
});

test("4. las excepciones de Super Admin siguen existiendo y estan justificadas", () => {
  // Una excepcion que apunta a un archivo borrado deja de proteger algo y pasa
  // a esconder que la lista quedo desactualizada.
  for (const route of SUPER_ADMIN_ROUTES) {
    assert.ok(
      routes.includes(route),
      `La excepcion "${route}" ya no corresponde a una ruta existente: quitala de la lista`
    );
  }
});

test("5. toda ruta dinamica exige sesion antes de tocar datos", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    const source = sourceWithoutComments(route);
    if (!/\bauth\s*\(\s*\)/.test(source) && !/requireActiveTenantUser/.test(source)) {
      offenders.push(route);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Estas rutas no verifican la sesion:\n  ${offenders.join("\n  ")}`
  );
});
