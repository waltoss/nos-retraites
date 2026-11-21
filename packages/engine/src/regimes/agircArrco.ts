import type { BaremeAgircArrco } from "../baremes/types.ts";
import type { Cumul } from "../compte.ts";
import type { Carriere, DetailAgircArrco } from "../types.ts";

export function computeAgircArrco(
	carriere: Carriere,
	cumul: Cumul,
	trimestresManquants: number,
	b: BaremeAgircArrco,
): DetailAgircArrco {
	const coefficient = b.coefficientAnticipation(trimestresManquants);
	const majoration =
		carriere.enfants.length >= 3 ? b.majorationTroisEnfants : 0;
	return {
		points: cumul.points,
		coefficientAnticipation: coefficient,
		majorationEnfants: majoration,
		pensionAnnuelle:
			cumul.points * b.valeurDeServiceDuPoint * coefficient * (1 + majoration),
	};
}
