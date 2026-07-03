-- Optimize common multi-tenant filters and operational reports.
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");
CREATE INDEX "User_tenantId_bloque_apto_idx" ON "User"("tenantId", "bloque", "apto");

CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

CREATE INDEX "Payment_tenantId_status_dueDate_idx" ON "Payment"("tenantId", "status", "dueDate");

CREATE INDEX "Pqrs_tenantId_numero_idx" ON "Pqrs"("tenantId", "numero");
CREATE INDEX "Pqrs_tenantId_mes_idx" ON "Pqrs"("tenantId", "mes");
CREATE INDEX "Pqrs_tenantId_asunto_idx" ON "Pqrs"("tenantId", "asunto");
CREATE INDEX "Pqrs_tenantId_bloque_apto_idx" ON "Pqrs"("tenantId", "bloque", "apto");
CREATE INDEX "Pqrs_tenantId_creadoPorId_idx" ON "Pqrs"("tenantId", "creadoPorId");

CREATE INDEX "PqrsFoto_tenantId_createdAt_idx" ON "PqrsFoto"("tenantId", "createdAt");

CREATE INDEX "HistorialPqrs_tenantId_creadoAt_idx" ON "HistorialPqrs"("tenantId", "creadoAt");
CREATE INDEX "HistorialPqrs_tenantId_pqrsId_creadoAt_idx" ON "HistorialPqrs"("tenantId", "pqrsId", "creadoAt");