import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PqrsAliasPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin/pqrs");
  if (session?.user?.role === "RESIDENTE") redirect("/residente");
  redirect("/auth/error?error=AccessDenied");
}