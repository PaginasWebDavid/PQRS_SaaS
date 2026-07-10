import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image src="/logo.svg" alt="PQRS Services" width={26} height={26} className="h-6 w-6" priority />
      {label ? (
        <span className="text-[15px] font-extrabold tracking-[-0.01em] text-[#1D1D1F]">
          PQRS <span className="font-medium text-[#6E6E73]">Services</span>
        </span>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const kind = normalized.includes("termin") || normalized.includes("resuelta") || normalized.includes("activo") || normalized.includes("pagado")
    ? "success"
    : normalized.includes("proceso") || normalized.includes("revision") || normalized.includes("gest")
      ? "navy"
      : normalized.includes("suspend") || normalized.includes("venc") || normalized.includes("error")
        ? "danger"
        : "warning";

  const classes = {
    success: "bg-[#ECF6EF] text-[#1A6B3A]",
    navy: "bg-[#EAEEF6] text-[#122545]",
    warning: "bg-[#FBF3DF] text-[#8A5A00]",
    danger: "bg-[#FBEAEA] text-[#B3261E]",
  }[kind];

  return <span className={cn("pqrs-badge", classes)}>{status}</span>;
}

export function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="pqrs-panel p-5 transition-colors hover:bg-[#FAFAFA]">
      <p className="pqrs-eyebrow">{label}</p>
      <p className="mt-3 text-[28px] font-extrabold tracking-[-0.03em] text-[#1D1D1F]">{value}</p>
      {hint ? <p className="mt-1 text-[12px] font-semibold text-[#6E6E73]">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="pqrs-card flex min-h-[180px] flex-col items-center justify-center p-8 text-center">
      <p className="text-sm font-extrabold text-[#1D1D1F]">{title}</p>
      <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-[#6E6E73]">{description}</p>
    </div>
  );
}
