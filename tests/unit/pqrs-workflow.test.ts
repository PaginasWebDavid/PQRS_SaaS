import test from "node:test";
import assert from "node:assert/strict";
import { isValidPqrsWorkflowType, VALID_NEXT_FASE_BY_WORKFLOW } from "../../src/domains/pqrs/pqrs-workflow.service";
import { pqrsPhaseDisplayLabel } from "../../src/lib/design/pqrsWorkflow";

test("1. isValidPqrsWorkflowType acepta solo SIMPLE/MAINTENANCE", () => {
  assert.equal(isValidPqrsWorkflowType("SIMPLE"), true);
  assert.equal(isValidPqrsWorkflowType("MAINTENANCE"), true);
  assert.equal(isValidPqrsWorkflowType("OTRO"), false);
  assert.equal(isValidPqrsWorkflowType(undefined), false);
  assert.equal(isValidPqrsWorkflowType(123), false);
});

test("2. MAINTENANCE conserva exactamente el grafo de 5 fases con bifurcacion insumos/proveedor", () => {
  assert.deepEqual(VALID_NEXT_FASE_BY_WORKFLOW.MAINTENANCE, {
    0: [1],
    1: [2, 3],
    2: [4],
    3: [4],
    4: [5],
  });
});

test("3. SIMPLE colapsa la gestion en una sola fase generica que cierra directo en 5", () => {
  assert.deepEqual(VALID_NEXT_FASE_BY_WORKFLOW.SIMPLE, {
    0: [1],
    1: [5],
  });
  // SIMPLE nunca ofrece 2 o 3 (insumos/proveedor) como destino valido.
  assert.ok(!VALID_NEXT_FASE_BY_WORKFLOW.SIMPLE[1].includes(2));
  assert.ok(!VALID_NEXT_FASE_BY_WORKFLOW.SIMPLE[1].includes(3));
});

test("4. las etiquetas SIMPLE no exponen fases de mantenimiento", () => {
  assert.equal(pqrsPhaseDisplayLabel("SIMPLE", 1), "En gestion");
  assert.equal(pqrsPhaseDisplayLabel("SIMPLE", 5), "Gestion completada");
  assert.equal(pqrsPhaseDisplayLabel("SIMPLE", 2), "Fase no aplicable");
  assert.match(pqrsPhaseDisplayLabel("MAINTENANCE", 2), /Adquisicion de insumos/);
});