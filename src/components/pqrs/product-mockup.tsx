import { StatusBadge } from "./design-system";

const rows = [
  ["PQ-2026-0142", "Humedad en zona comun", "En proceso", "Hace 12 min"],
  ["PQ-2026-0141", "Ruido recurrente", "En revision", "Hace 38 min"],
  ["PQ-2026-0140", "Luminaria parqueadero", "Terminada", "Ayer"],
];

export function ProductMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-black/[0.06] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-[#FAFAFA] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="font-mono text-[10px] font-medium text-[#8E8E93]">app.pqrsservices.com</span>
      </div>
      <div className="grid md:grid-cols-[190px_1fr]">
        <aside className="hidden border-r border-black/[0.06] bg-[#FAFAFA] p-4 md:block">
          <div className="mb-5 h-8 rounded-full bg-[#EAEEF6]" />
          {["Dashboard", "PQRS", "Usuarios", "Reportes"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-xl px-3 py-2 text-xs font-bold ${index === 1 ? "bg-[#EAEEF6] text-[#122545]" : "text-[#6E6E73]"}`}>
              {item}
            </div>
          ))}
        </aside>
        <main className="p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="pqrs-eyebrow">CONJUNTO ACTUAL</p>
              <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-[#1D1D1F]">Panel de PQRS</h3>
            </div>
            <StatusBadge status="Licencia activa" />
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {["24", "11", "92%"].map((value, index) => (
              <div key={value} className="rounded-2xl bg-[#F5F5F7] p-4">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#8E8E93]">{["Abiertas", "Proceso", "Cierre"][index]}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">{value}</p>
              </div>
            ))}
          </div>
          {!compact ? (
            <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
              <table className="pqrs-table">
                <thead><tr><th>Radicado</th><th>Solicitud</th><th>Estado</th><th>Actualizacion</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row[0]}><td className="font-mono text-[11px] text-[#122545]">{row[0]}</td><td>{row[1]}</td><td><StatusBadge status={row[2]} /></td><td>{row[3]}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
