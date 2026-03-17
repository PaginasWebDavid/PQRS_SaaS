import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PqrsList } from "./pqrs-list";

export default async function PqrsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return <PqrsList role={session.user.role} />;
}
