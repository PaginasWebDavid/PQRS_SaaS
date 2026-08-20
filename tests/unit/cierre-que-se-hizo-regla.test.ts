import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Prueba estructural, no de comportamiento.
//
// LA REGLA
//
// "Que se hizo para cerrar" es la explicacion de haberse SALTADO fases. Solo se
// pide donde hay fases que saltarse:
//
//     workflowType === "MAINTENANCE" && faseActual !== 5
//
// Antes la condicion era solo `faseActual !== 5`. Como una PQRS del flujo
// SIMPLE se queda en la fase 1, se pedia SIEMPRE: el administrador terminaba
// escribiendo cuatro textos para un caso trivial (nota de contacto, accion
// tomada, evidencia y este cuarto campo), y el cuarto duplicaba al segundo.
//
// POR QUE ESTA PRUEBA
//
// La regla vive necesariamente en dos sitios: el API la exige y la pantalla la
// usa para habilitar el boton. Esa duplicacion es inevitable en una validacion
// cliente/servidor, pero se desincroniza sola. Si divergen, el sintoma es de
// los peores: un boton habilitado que al pulsarlo devuelve un error 400, o un
// campo pedido que el servidor ni mira.

const API = join(process.cwd(), "src", "app", "api", "pqrs", "[id]", "route.ts");
const PANTALLA = join(process.cwd(), "src", "app", "admin", "pqrs", "page.tsx");

test("el API solo exige 'que se hizo para cerrar' en el flujo con fases", () => {
  const fuente = readFileSync(API, "utf8");
  assert.match(
    fuente,
    /pqrs\.workflowType === "MAINTENANCE" && pqrs\.faseActual !== 5/,
    "El API dejo de condicionar 'que se hizo para cerrar' al flujo MAINTENANCE. " +
      "Si vuelve a ser solo `faseActual !== 5`, el flujo SIMPLE pide un texto " +
      "que no aplica y que duplica 'accion tomada'."
  );
});

test("la pantalla de administracion aplica exactamente la misma regla", () => {
  const fuente = readFileSync(PANTALLA, "utf8");
  assert.match(
    fuente,
    /workflowType === 'MAINTENANCE' && selected\.faseActual !== 5/,
    "La pantalla ya no coincide con la regla del API. Si el cliente pide el " +
      "campo y el servidor no (o al reves), el administrador se topa con un " +
      "boton que falla o con un campo inutil."
  );
});

test("abrir el caso lo deja en gestion, sin un clic extra que no captura nada", () => {
  const fuente = readFileSync(API, "utf8");
  const contacto = fuente.slice(fuente.indexOf("Primer contacto: EN_ESPERA"));
  assert.match(
    contacto.slice(0, 5000),
    /faseActual: 1/,
    "El primer contacto ya no deja la PQRS en fase 1. Sin eso vuelve a hacer " +
      "falta pulsar 'Iniciar gestion', un paso que solo mueve el numero de " +
      "fase y no registra ningun dato."
  );
});
