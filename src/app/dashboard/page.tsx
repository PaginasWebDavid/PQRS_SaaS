import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function DashboardAliasPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin/dashboard");
  if (session?.user?.role === "CONSEJO") redirect("/consejo");
  if (session?.user?.role === "RESIDENTE") redirect("/residente");
  if (session?.user?.role === "SUPER_ADMIN") redirect("/super-admin");
  redirect("/auth/login");
}