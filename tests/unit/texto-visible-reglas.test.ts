import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Pruebas estructurales sobre el TEXTO que ve el usuario, no sobre comportamiento.
//
// Nacen de dos fallos reales que llegaron a produccion y que ninguna prueba de
// comportamiento podia atrapar, porque el codigo funcionaba perfectamente: lo
// que estaba mal era lo que decia.

const RAIZ = process.cwd();

// -----------------------------------------------------------------------------
// REGLA 1: los nombres de las fases se definen UNA vez.
//
// La ayuda del administrador enumeraba las cinco fases como "diagnostico,
// cotizacion o proveedor, ejecucion, verificacion y cierre". Cuatro de esos
// cinco nombres nunca existieron en el producto. El administrador abria la
// ayuda para orientarse y buscaba pasos que no estaban en ninguna pantalla.
//
// La causa es que el texto se escribio a mano en tres archivos distintos en vez
// de leerse de pqrsWorkflow.ts, que es donde viven los nombres de verdad.
// -----------------------------------------------------------------------------

const FLUJO = join(RAIZ, "src", "lib", "design", "pqrsWorkflow.ts");

// Enumeran las cinco fases en prosa dirigida al administrador.
const ARCHIVOS_QUE_ENUMERAN_FASES = [
  join(RAIZ, "src", "app", "admin", "ayuda", "page.tsx"),
  join(RAIZ, "src", "app", "admin", "configuracion", "page.tsx"),
  join(RAIZ, "src", "app", "admin", "pqrs", "page.tsx"),
];

// Nombres que la interfaz llego a mostrar y que el producto nunca tuvo.
const FASES_INVENTADAS = ["diagnóstico", "cotización", "verificación"];

test("los nombres de fase que se muestran existen de verdad en el flujo", () => {
  const flujo = readFileSync(FLUJO, "utf8");

  // Las etiquetas reales, extraidas de su unica fuente.
  const reales: string[] = [];
  const patron = /^\s*\d:\s*"([^"]+)"/gm;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = patron.exec(flujo)) !== null) reales.push(coincidencia[1]);
  assert.equal(
    reales.length,
    5,
    `Se esperaban 5 etiquetas de fase en pqrsWorkflow.ts, se encontraron ${reales.length}. ` +
      "Si el flujo cambio de numero de fases, esta prueba y los textos de la interfaz deben actualizarse juntos."
  );

  for (const ruta of ARCHIVOS_QUE_ENUMERAN_FASES) {
    const texto = readFileSync(ruta, "utf8").toLowerCase();
    for (const inventada of FASES_INVENTADAS) {
      assert.ok(
        !texto.includes(inventada),
        `${ruta} menciona "${inventada}", que no es una fase del producto.\n` +
          `Las fases reales son: ${reales.join(", ")}.\n` +
          "Los textos de ayuda deben describir las fases que el administrador va a ver en pantalla."
      );
    }
  }
});

// -----------------------------------------------------------------------------
// REGLA 2: a la persona que usa el producto se le habla de usted.
//
// La interfaz la operan administradoras de conjuntos en Colombia, donde el
// tuteo en una herramienta de trabajo suena impropio. El tratamiento se
// unifico en un solo barrido, y sin una guarda vuelve a filtrarse en cuanto se
// escribe una pantalla nueva.
//
// Se excluye src/app/legal/: son documentos contractuales, hablan en tercera
// persona ("el Cliente", "el Conjunto") y no son interfaz.
// -----------------------------------------------------------------------------

const RAICES_DE_INTERFAZ = [join(RAIZ, "src", "app"), join(RAIZ, "src", "components")];
const EXCLUIDO = join(RAIZ, "src", "app", "legal");

// Solo formas inequivocas. Deliberadamente NO se vigilan "tu", "tus" ni "te":
// aparecen dentro de identificadores y rutas, y darian falsos positivos que
// terminarian con alguien desactivando la prueba.
const TUTEO = [
  "puedes", "debes", "tienes", "quieres", "necesitas",
  "estás", "verás", "podrás", "tendrás", "recibirás",
  "escríbenos", "cuéntanos", "avísanos",
  "tuyo", "tuya", "tuyos", "tuyas", "contigo",
];

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (ruta.startsWith(EXCLUIDO)) continue;
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

// Los comentarios estan escritos de manera informal a proposito y no se muestran.
const esComentario = (linea: string) => {
  const t = linea.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

test("la interfaz trata de usted, no de tu", () => {
  const hallazgos: string[] = [];

  for (const raiz of RAICES_DE_INTERFAZ) {
    for (const ruta of archivosTsx(raiz)) {
      const lineas = readFileSync(ruta, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (esComentario(linea)) return;
        const minus = linea.toLowerCase();
        for (const forma of TUTEO) {
          if (new RegExp(`(^|[^a-záéíóúñ])${forma}([^a-záéíóúñ]|$)`).test(minus)) {
            hallazgos.push(`${ruta.replace(RAIZ, "")}:${i + 1}  "${forma}"`);
            break;
          }
        }
      });
    }
  }

  assert.deepEqual(
    hallazgos,
    [],
    "Hay tuteo en texto visible. Cambie a la forma de usted:\n" + hallazgos.join("\n")
  );
});
