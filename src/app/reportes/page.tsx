import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function ReportesAliasPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin/reportes");
  if (session?.user?.role === "CONSEJO") redirect("/consejo/reportes");
  redirect("/auth/error?error=AccessDenied");
}