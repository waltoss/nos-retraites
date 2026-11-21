import type { Individu, Sexe } from "./types.ts";

/** Population réelle par sexe et âge révolu, une année donnée. Le dernier âge regroupe les plus âgés. */
export interface Pyramide {
	annee: number;
	femmes: ReadonlyArray<number>;
	hommes: ReadonlyArray<number>;
}

/**
 * Champ : la partie de la population réelle que la population simulée représente.
 * La part peut dépendre de l'âge et du sexe. D'autres champs (fonction publique,
 * indépendants) pourront s'ajouter à côté sans toucher à celui-ci.
 */
export interface Champ {
	nom: string;
	part(age: number, sexe: Sexe): number;
}

/**
 * Donne à chaque individu le nombre de personnes réelles qu'il représente :
 * la population de son âge et de son sexe dans le champ, partagée entre les individus simulés de cette cellule.
 * Le poids ne dépend que de l'année de naissance et du sexe, donc pas du scénario.
 */
export function ponderer(
	population: Individu[],
	pyramide: Pyramide,
	champ: Champ,
): Individu[] {
	const cle = (age: number, sexe: Sexe) => `${sexe}${age}`;
	const simules = new Map<string, number>();
	for (const i of population) {
		const k = cle(pyramide.annee - i.carriere.anneeNaissance, i.carriere.sexe);
		simules.set(k, (simules.get(k) ?? 0) + 1);
	}
	return population.map((i) => {
		const sexe = i.carriere.sexe;
		const age = pyramide.annee - i.carriere.anneeNaissance;
		const ages = sexe === "F" ? pyramide.femmes : pyramide.hommes;
		const reels = ages[Math.max(0, Math.min(ages.length - 1, age))] ?? 0;
		const n = simules.get(cle(age, sexe)) ?? 1;
		return { ...i, poids: (reels * champ.part(age, sexe)) / n };
	});
}
