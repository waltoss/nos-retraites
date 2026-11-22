import type {
	Carriere,
	DetailCnav,
	Duree,
	Individu,
	Pension,
	Sexe,
} from "./types.ts";

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
	/** L'année compte quand la part suit la génération plutôt que l'âge ; absente, c'est l'année de la pyramide de référence. */
	part(age: number, sexe: Sexe, annee?: number, carriere?: Carriere): number;
	/**
	 * Ce qui, en plus de l'âge et du sexe, distingue les cellules entre lesquelles la population
	 * réelle est partagée (le régime d'un fonctionnaire) ; absent, rien.
	 */
	cellule?(carriere: Carriere): string;
	/**
	 * Affiliations dont une année travaillée fait un cotisant du champ ; absent, toutes celles du
	 * modèle. Un salarié du privé qui a été artisan n'est pas compté parmi les cotisants du privé
	 * ces années-là.
	 */
	affiliations?: readonly string[];
	/** Régimes dont les pensions sont celles du champ ; absent, tous. */
	regimes?: readonly string[];
}

/** Vrai quand une année relève du champ. */
export function anneeDuChamp(
	champ: Champ,
	annee: { affiliation: string },
): boolean {
	return !champ.affiliations || champ.affiliations.includes(annee.affiliation);
}

/**
 * Durée et taux vus du régime de base du champ. Pour un salarié du privé qui a surtout été artisan,
 * c'est le régime général qui répond, pas le régime qui a décidé de son départ.
 */
export function dureeDuChamp(champ: Champ, p: Pension): Duree {
	for (const id of champ.regimes ?? []) {
		const d = p.parRegime[id] as Partial<DetailCnav> | undefined;
		if (
			d?.trimestresValides !== undefined &&
			d.dureeRequise !== undefined &&
			d.trimestresDecote !== undefined &&
			d.trimestresSurcote !== undefined
		)
			return {
				trimestresValides: d.trimestresValides,
				dureeRequise: d.dureeRequise,
				trimestresDecote: d.trimestresDecote,
				trimestresSurcote: d.trimestresSurcote,
				minimumApplique: d.minimumContributifApplique ?? false,
			};
	}
	return p.duree;
}

/** Pension mensuelle brute versée par les régimes du champ, à la liquidation. */
export function pensionDuChamp(champ: Champ, p: Pension): number {
	if (!champ.regimes) return p.mensuelleBrute;
	let annuelle = 0;
	for (const id of champ.regimes)
		annuelle += p.parRegime[id]?.pensionAnnuelle ?? 0;
	return annuelle / 12;
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
	const cle = (age: number, c: Carriere) =>
		`${c.sexe}${age}${champ.cellule?.(c) ?? ""}`;
	const simules = new Map<string, number>();
	for (const i of population) {
		const k = cle(pyramide.annee - i.carriere.anneeNaissance, i.carriere);
		simules.set(k, (simules.get(k) ?? 0) + 1);
	}
	return population.map((i) => {
		const sexe = i.carriere.sexe;
		const age = pyramide.annee - i.carriere.anneeNaissance;
		const ages = sexe === "F" ? pyramide.femmes : pyramide.hommes;
		const reels = ages[Math.max(0, Math.min(ages.length - 1, age))] ?? 0;
		const n = simules.get(cle(age, i.carriere)) ?? 1;
		return {
			...i,
			poids: (reels * champ.part(age, sexe, undefined, i.carriere)) / n,
		};
	});
}
