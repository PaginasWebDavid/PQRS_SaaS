import { format, differenceInCalendarDays, addDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea una fecha a dd/MM/yyyy
 */
export function formatDate(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy");
}

/**
 * Obtiene el nombre del mes en español (ej: "Enero", "Febrero")
 */
export function getMesNombre(date: Date | string): string {
  return format(new Date(date), "MMMM", { locale: es }).replace(/^\w/, (c) =>
    c.toUpperCase()
  );
}

/**
 * Calcula días hábiles entre dos fechas (lunes a viernes, sin feriados)
 */
export function calcularDiasHabiles(inicio: Date, fin: Date): number {
  let count = 0;
  const totalDays = differenceInCalendarDays(fin, inicio);

  for (let i = 1; i <= totalDays; i++) {
    const day = addDays(inicio, i);
    if (!isWeekend(day)) {
      count++;
    }
  }

  return count;
}

/**
 * Calcula días hábiles desde una fecha hasta hoy
 */
export function diasHabilesDesde(fecha: Date | string): number {
  return calcularDiasHabiles(new Date(fecha), new Date());
}
