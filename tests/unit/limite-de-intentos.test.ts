import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Pruebas estructurales sobre el limite de intentos.
//
// No ejercitan la ventana deslizante (eso necesita base de datos): vigilan que
// el limite siga CONECTADO donde importa. Es la clase de proteccion que se
// borra sin querer al refactorizar y cuya ausencia no rompe ninguna pantalla,
// asi que nadie se entera hasta que alguien la aprovecha.

const RAIZ = process.cwd();
const AUTH = join(RAIZ, "src", "lib", "auth.ts");
const OLVIDO = join(RAIZ, "src", "app", "api", "auth", "forgot-password", "route.ts");

test("el login limita por correo y por IP", () => {
  const codigo = readFileSync(AUTH, "utf8");

  assert.ok(
    codigo.includes("login:correo:"),
    "authorize() ya no limita por correo. Sin eso, se puede probar contrasenas " +
      "contra una cuenta concreta sin tope."
  );
  assert.ok(
    codigo.includes("login:ip:"),
    "authorize() ya no limita por IP. Sin eso, se pueden barrer muchas cuentas " +
      "distintas desde una sola maquina."
  );
});

test("el intento se cuenta antes de comparar la contrasena", () => {
  const codigo = readFileSync(AUTH, "utf8");
  const primerRegistro = codigo.indexOf("registrarIntento");
  const comparacion = codigo.indexOf("bcrypt.compare");

  assert.ok(primerRegistro !== -1 && comparacion !== -1, "Falta el limite o la comparacion en auth.ts");
  assert.ok(
    primerRegistro < comparacion,
    "El intento se registra despues de bcrypt.compare. Debe ir antes: bcrypt es " +
      "costoso a proposito, y dejar que un ataque lo dispare sin tope convierte " +
      "el propio mecanismo de seguridad en la via para tumbar el servidor."
  );
});

test("recuperar contrasena limita, y no delata que correos existen", () => {
  const codigo = readFileSync(OLVIDO, "utf8");

  assert.ok(
    codigo.includes("registrarIntento"),
    "forgot-password ya no limita. Cada solicitud atendida envia un correo real: " +
      "tiene costo y sirve para inundar el buzon de un tercero."
  );
  assert.ok(
    !/status:\s*429/.test(codigo),
    "forgot-password responde 429 al agotarse el limite. Debe devolver la misma " +
      "respuesta generica de siempre: una respuesta distinta convierte este punto " +
      "en un oraculo para averiguar que correos estan registrados."
  );
});

// -----------------------------------------------------------------------------
// La tabla nueva vive en el esquema `public`, que en este proyecto tiene RLS
// activo en todas sus tablas. Una tabla sin RLS seria la unica accesible para
// los roles anon y authenticated de PostgREST.
// -----------------------------------------------------------------------------

test("toda migracion que crea una tabla le activa RLS", () => {
  const dir = join(RAIZ, "prisma", "migrations");
  const sinRls: string[] = [];

  for (const carpeta of readdirSync(dir)) {
    const archivo = join(dir, carpeta, "migration.sql");
    let sql: string;
    try {
      sql = readFileSync(archivo, "utf8");
    } catch {
      continue;
    }

    const creadas: string[] = [];
    const patron = /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g;
    let coincidencia: RegExpExecArray | null;
    while ((coincidencia = patron.exec(sql)) !== null) creadas.push(coincidencia[1]);
    for (const tabla of creadas) {
      // La migracion que activo RLS en bloque recorre las tablas con un DO,
      // asi que cubre todo lo creado antes de ella.
      if (sql.includes("ENABLE ROW LEVEL SECURITY")) continue;
      sinRls.push(`${carpeta} -> ${tabla}`);
    }
  }

  // Se compara contra la foto conocida: las tablas anteriores al barrido en
  // bloque quedaron cubiertas por la migracion 20260804000200.
  const nuevasSinCubrir = sinRls.filter((x) => x.split(" -> ")[0] > "20260804000200");

  assert.deepEqual(
    nuevasSinCubrir,
    [],
    "Hay tablas creadas despues del barrido de RLS que no lo activan:\n" +
      nuevasSinCubrir.join("\n") +
      "\nAgregue ALTER TABLE \"<tabla>\" ENABLE ROW LEVEL SECURITY; a su migracion."
  );
});
