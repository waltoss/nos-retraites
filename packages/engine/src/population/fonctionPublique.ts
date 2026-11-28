import type { Champ } from "../ponderation.ts";
import type { RegimeFonctionPublique } from "../types.ts";
import data from "./fonctionPublique.data.json" with { type: "json" };

type Parts = Record<RegimeFonctionPublique, Record<"F" | "H", number[]>>;
const parts = data.parts as Parts;

/** Part d'une génération qui fait carrière dans un régime de la fonction publique. */
export function partFonctionPublique(
	regime: RegimeFonctionPublique,
	sexe: "F" | "H",
	generation: number,
	p: Parts = parts,
): number {
	const v = p[regime]?.[sexe] ?? [];
	const i = Math.max(
		0,
		Math.min(v.length - 1, generation - data.generationDebut),
	);
	return v[i] ?? 0;
}

const REGIMES_PUBLICS = ["sre", "cnracl", "militaire"] as const;

/**
 * Fonctionnaires civils de l'État, des collectivités et des hôpitaux, et leurs retraités.
 * Seuls leurs années et leurs pensions de fonctionnaire sont du champ : ce qu'ils ont cotisé et
 * perçoivent comme salariés du privé relève de `CHAMP_PRIVE`.
 * La part suit la génération à tout âge : qui entre dans la fonction publique y reste, puis en est
 * retraité. Réglée sur les cotisants et les retraités des deux régimes de 2010 à 2025
 * (scripts/build-population-publique.ts).
 */
export const CHAMP_PUBLIC: Champ = {
	nom: "Fonctionnaires",
	affiliations: REGIMES_PUBLICS,
	regimes: REGIMES_PUBLICS,
	aPart: ["prive", "salarieAgricole", "cnav", "agircArrco"],
	part: (age, sexe, annee = data.annee, carriere) => {
		const regime = carriere?.fonctionPublique?.regime;
		return regime ? partFonctionPublique(regime, sexe, annee - age) : 0;
	},
	cellule: (carriere) => carriere.fonctionPublique?.regime ?? "",
};
