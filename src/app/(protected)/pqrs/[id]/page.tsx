import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PqrsDetail } from "./pqrs-detail";

export default async function PqrsDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return <PqrsDetail pqrsId={params.id} role={session.user.role} />;
}
