import { prisma } from "@/lib/prisma";
import LandingPage, { type PricingTier } from "./LandingPage";

// La landing es un componente cliente (todo su layout responsive depende de un
// booleano calculado en JS), asi que no puede consultar la base. Esta pagina
// servidor lee las reglas de precio activas y se las pasa como props.
//
// El motivo es concreto: los tramos estaban escritos a mano dentro de la
// landing y quedaron desactualizados. Mostraba 50-100 / 101-300 / 301-500 /
// 501+ cuando las reglas vigentes ya eran otras. Con esto, el precio que ve
// un administrador en la pagina publica es el mismo que le va a cobrar el
// sistema, porque sale de la misma tabla.
//
// Se regenera cada hora en vez de consultar en cada visita: un cambio de
// tarifa no necesita reflejarse al segundo, y la landing debe responder
// rapido para quien llega desde un anuncio o un correo.
export const revalidate = 3600;

// Etiquetas por posicion. Se separan de los datos para que agregar o quitar un
// tramo en Super Admin no obligue a tocar codigo: si aparecen mas tramos de
// los etiquetados, los ultimos se quedan sin etiqueta y no rompen nada.
const TIER_LABELS = [
  "Conjuntos pequeños",
  "El más común",
  "Alto volumen",
  "Gran escala",
  "Portafolios",
];

function formatRange(minUnits: number, maxUnits: number | null): string {
  return maxUnits == null ? `${minUnits}+` : `${minUnits}-${maxUnits}`;
}

async function getPricingTiers(): Promise<PricingTier[]> {
  // Solo los limites del tramo. El precio no se selecciona: lo que no sale de
  // la base no puede terminar en el HTML de una pagina publica.
  const rules = await prisma.pricingRule.findMany({
    where: { type: "MONTHLY", isActive: true },
    orderBy: { minUnits: "asc" },
    select: { minUnits: true, maxUnits: true },
  });

  // El tramo "mas comun" se destaca visualmente. Se marca el segundo porque es
  // el tamano tipico de conjunto en el mercado objetivo, no el mas caro.
  const popularIndex = rules.length > 1 ? 1 : 0;

  return rules.map((rule, index) => ({
    label: TIER_LABELS[index] ?? "A la medida",
    range: formatRange(rule.minUnits, rule.maxUnits),
    popular: index === popularIndex,
  }));
}

export default async function Page() {
  // Si la base no responde, la landing debe seguir cargando: es la pagina de
  // ventas. Se muestra sin tabla de precios antes que devolver un error.
  let pricingTiers: PricingTier[] = [];
  try {
    pricingTiers = await getPricingTiers();
  } catch {
    pricingTiers = [];
  }

  return <LandingPage pricingTiers={pricingTiers} />;
}
