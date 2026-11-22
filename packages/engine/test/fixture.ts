import { BAREMES_FICTIFS, type Carriere, type Etat, type Sexe } from "../src/index.ts";

export { BAREMES_FICTIFS };

/** Carrière continue en emploi entre deux âges inclus, au salaire constant. */
export function carriereContinue(
	ageDebut: number,
	ageFin: number,
	salaireBrut: number,
	options: { sexe?: Sexe; enfants?: number[]; anneeNaissance?: number; etat?: Etat } = {},
): Carriere {
	const anneeNaissance = options.anneeNaissance ?? 1960;
	const annees = [];
	for (let age = ageDebut; age <= ageFin; age++) {
		annees.push({ annee: anneeNaissance + age, affiliation: "prive" as const, etat: options.etat ?? ("emploi" as Etat), salaireBrut });
	}
	return { anneeNaissance, sexe: options.sexe ?? "H", enfants: options.enfants ?? [], cadre: false, annees };
}
