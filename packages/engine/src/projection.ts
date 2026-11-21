import { type Baremes, valeur } from "./baremes/types.ts";
import { buildCompte, type CompteCarriere } from "./compte.ts";
import {
	appliquerRegles,
	computeCotisations,
	computePension,
	type ReglesScenario,
} from "./liquidation.ts";
import type { Champ, Pyramide } from "./ponderation.ts";
import type { Individu, Pension } from "./types.ts";

/** Population réelle projetée, année par année. Une année absente reprend la dernière connue. */
export type PyramidesProjetees = Readonly<Record<number, Pyramide>>;

export interface OptionsProjection {
	debut: number;
	fin: number;
	pyramides: PyramidesProjetees;
	champ: Champ;
	/**
	 * Première année où les règles du scénario s'appliquent. Ceux qui sont partis avant gardent
	 * leur pension calculée avec le droit en vigueur ; personne ne part avant cette année
	 * au titre des nouvelles règles.
	 */
	anneeEffet: number;
	comptes?: CompteCarriere[];
	/** Pensions du droit en vigueur, si elles ont déjà été calculées. */
	pensionsReference?: Pension[];
	ageMin?: number;
	ageMax?: number;
}

export interface AnneeProjetee {
	annee: number;
	cotisants: number;
	retraites: number;
	/** Sommes annuelles, en euros de l'année de référence. */
	cotisations: number;
	pensions: number;
	/** Pension mensuelle moyenne des retraités. */
	pensionMoyenne: number;
	/** Salaire brut annuel moyen des cotisants. */
	salaireMoyen: number;
	/** Âge moyen de ceux qui partent cette année-là. */
	ageMoyenDepart: number;
}

export interface GenerationProjetee {
	generation: number;
	ageMoyenDepart: number;
	/** Pension mensuelle moyenne à la liquidation, en euros de l'année de référence. */
	pensionMoyenne: number;
}

export interface Projection {
	annees: AnneeProjetee[];
	generations: GenerationProjetee[];
	dureeMs: number;
}

/** Pension de chaque individu avec les règles données, comme si elles avaient toujours existé. */
export function computePensions(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario = {},
	comptes?: CompteCarriere[],
): Pension[] {
	const be = appliquerRegles(b, regles);
	return population.map((i, k) =>
		computePension(i.carriere, be, {
			regles,
			compte: comptes?.[k] ?? buildCompte(i.carriere, b),
		}),
	);
}

/**
 * Projette le système année par année. Les carrières sont déjà écrites jusqu'à 70 ans ;
 * on regarde chaque année qui cotise, qui perçoit, et combien de personnes réelles chacun représente.
 */
export function runProjection(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario,
	options: OptionsProjection,
): Projection {
	const depart = performance.now();
	const { debut, fin, anneeEffet, champ } = options;
	const ageMin = options.ageMin ?? 18;
	const ageMax = options.ageMax ?? 96;
	const be = appliquerRegles(b, regles);
	const comptes =
		options.comptes ?? population.map((i) => buildCompte(i.carriere, b));
	const reference =
		options.pensionsReference ?? computePensions(population, b, {}, comptes);
	const inchange = Object.keys(regles).length === 0;
	const multiplicateurPoint = regles.valeurDuPoint ?? 1;
	const revalorisation = 1 + (regles.revalorisationReelle ?? 0);

	// Pension effective de chacun : celle du droit en vigueur s'il est parti avant la réforme.
	const n = population.length;
	const anneeDepart = new Int32Array(n);
	const ageDepart = new Float64Array(n);
	const base = new Float64Array(n);
	const complementaire = new Float64Array(n);
	const avantReforme = new Uint8Array(n);
	for (let k = 0; k < n; k++) {
		const individu = population[k] as Individu;
		const p0 = reference[k] as Pension;
		let p = p0;
		if (p0.liquidation.annee < anneeEffet) {
			avantReforme[k] = 1;
		} else if (!inchange) {
			const c = individu.carriere;
			p = computePension(c, be, { regles, compte: comptes[k] });
			if (p.liquidation.annee < anneeEffet)
				p = computePension(c, be, {
					regles,
					compte: comptes[k],
					ageLiquidation: (anneeEffet - c.anneeNaissance) * 4,
				});
		}
		anneeDepart[k] = p.liquidation.annee;
		ageDepart[k] = p.liquidation.age / 4;
		base[k] = p.cnav.pensionAnnuelle;
		complementaire[k] = p.agircArrco.pensionAnnuelle;
	}

	// Individus simulés par génération et par sexe : le dénominateur des poids.
	const simules = new Map<string, number>();
	const cle = (individu: Individu) =>
		`${individu.carriere.sexe}${individu.carriere.anneeNaissance}`;
	for (const individu of population)
		simules.set(cle(individu), (simules.get(cle(individu)) ?? 0) + 1);
	const anneesConnues = Object.keys(options.pyramides).map(Number);
	const derniere = Math.max(...anneesConnues);
	const premiere = Math.min(...anneesConnues);

	const annees: AnneeProjetee[] = [];
	for (let annee = debut; annee <= fin; annee++) {
		const pyramide = options.pyramides[
			Math.max(premiere, Math.min(derniere, annee))
		] as Pyramide;
		const ligne = {
			annee,
			cotisants: 0,
			retraites: 0,
			cotisations: 0,
			pensions: 0,
			salaires: 0,
			departs: 0,
			ages: 0,
		};
		const depuisEffet = Math.max(0, annee - anneeEffet + 1);
		// La valeur du point vaut pour toutes les pensions complémentaires en cours.
		const service = b.agircArrco.indiceValeurDeService
			? valeur(b.agircArrco.indiceValeurDeService, annee)
			: 1;
		for (let k = 0; k < n; k++) {
			const individu = population[k] as Individu;
			const c = individu.carriere;
			const age = annee - c.anneeNaissance;
			if (age < ageMin || age > ageMax) continue;
			const reels = (c.sexe === "F" ? pyramide.femmes : pyramide.hommes)[
				Math.min(age, pyramide.femmes.length - 1)
			];
			const poids =
				((reels ?? 0) * champ.part(age, c.sexe)) /
				(simules.get(cle(individu)) ?? 1);
			if (poids === 0) continue;
			const partiDepuis = annee - (anneeDepart[k] as number);
			if (partiDepuis >= 0) {
				// Les pensions liquidées suivent les prix, plus ou moins l'écart choisi par le scénario.
				const indexation =
					revalorisation === 1
						? 1
						: revalorisation ** Math.min(depuisEffet, partiDepuis);
				const pointApplique =
					avantReforme[k] && annee >= anneeEffet ? multiplicateurPoint : 1;
				ligne.retraites += poids;
				ligne.pensions +=
					poids *
					indexation *
					((base[k] as number) +
						(complementaire[k] as number) * pointApplique * service);
				if (partiDepuis === 0) {
					ligne.departs += poids;
					ligne.ages += poids * (ageDepart[k] as number);
				}
				continue;
			}
			const premiereAnnee = c.annees[0]?.annee ?? annee + 1;
			const a = c.annees[annee - premiereAnnee];
			if (a && a.salaireBrut > 0) {
				ligne.cotisants += poids;
				ligne.salaires += poids * a.salaireBrut;
				ligne.cotisations +=
					poids *
					computeCotisations(
						a.salaireBrut,
						annee >= anneeEffet ? be : b,
						annee,
					);
			}
		}
		annees.push({
			annee,
			cotisants: ligne.cotisants,
			retraites: ligne.retraites,
			cotisations: ligne.cotisations,
			pensions: ligne.pensions,
			pensionMoyenne: ligne.retraites
				? ligne.pensions / ligne.retraites / 12
				: 0,
			salaireMoyen: ligne.cotisants ? ligne.salaires / ligne.cotisants : 0,
			ageMoyenDepart: ligne.departs ? ligne.ages / ligne.departs : 0,
		});
	}

	// Par génération : ce que la réforme change pour ceux qui partiront plus tard.
	const parGeneration = new Map<
		number,
		{ n: number; age: number; pension: number }
	>();
	for (let k = 0; k < n; k++) {
		const g = (population[k] as Individu).carriere.anneeNaissance;
		let x = parGeneration.get(g);
		if (!x) {
			x = { n: 0, age: 0, pension: 0 };
			parGeneration.set(g, x);
		}
		x.n++;
		x.age += ageDepart[k] as number;
		x.pension += ((base[k] as number) + (complementaire[k] as number)) / 12;
	}
	const generations = [...parGeneration.entries()]
		.sort(([x], [y]) => x - y)
		.map(([generation, x]) => ({
			generation,
			ageMoyenDepart: x.age / x.n,
			pensionMoyenne: x.pension / x.n,
		}));

	return { annees, generations, dureeMs: performance.now() - depart };
}
