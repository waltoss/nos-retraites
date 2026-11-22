import type { BaremeIndependants } from "../baremes/types.ts";
import type { DetailRci } from "../types.ts";

/**
 * Retraite complémentaire des indépendants : points × valeur de service, réduite par un abattement
 * propre au régime quand la retraite de base n'est pas au taux plein. Trop peu de points donnent
 * un capital versé une fois, qui n'est pas compté ici.
 */
export function computeRci(
	points: number,
	trimestresManquants: number,
	b: BaremeIndependants,
): DetailRci {
	const coefficient = b.coefficientAbattement(trimestresManquants);
	const versementUnique = points < b.seuilVersementUnique;
	return {
		points,
		coefficientAbattement: coefficient,
		versementUnique,
		pensionAnnuelle: versementUnique
			? 0
			: points * coefficient * b.valeurDeServiceDuPoint,
	};
}
