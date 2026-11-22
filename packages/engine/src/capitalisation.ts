import data from "./capitalisation.data.json" with { type: "json" };
import type { Pyramide } from "./ponderation.ts";
import {
	type Preparation,
	type PyramidesProjetees,
	poidsDeLAnnee,
} from "./projection.ts";
import type { AnneeSysteme } from "./systeme.ts";
import type { Individu, Pension } from "./types.ts";

/**
 * Un étage de retraite par capitalisation, dans sa version la plus simple : chaque salarié du
 * privé verse une part de son salaire sur un compte, le compte rapporte un rendement réel fixe,
 * et il est converti en rente viagère au départ.
 */
export interface Capitalisation {
	/** Part du salaire brut versée chaque année (0,02 = 2 points). */
	taux: number;
	/** Rendement réel annuel, net de frais. */
	rendement: number;
	/**
	 * Part du versement prise sur les cotisations du système par répartition (0 = versement
	 * nouveau, 1 = entièrement pris sur les cotisations). Les droits à pension ne changent pas.
	 */
	partDetournee: number;
}

/** Hypothèses de rendement réel net, avec leur source (data/references/capitalisation.json). */
export const RENDEMENTS_CAPITALISATION = data.rendementReel as Record<
	"bas" | "central" | "haut",
	{ valeur: number; source: string; base: string }
>;
export const SOURCES_CAPITALISATION = data.sources as Record<
	string,
	{ titre: string; url: string; date: string }
>;

export interface AnneeCapitalisation {
	annee: number;
	/** Sommes annuelles, en euros de l'année de référence. */
	versements: number;
	rentes: number;
	/** Comptes des actifs et réserves des rentes en cours, en fin d'année. */
	encours: number;
	rentiers: number;
}

export interface GenerationCapitalisation {
	generation: number;
	/** Rente mensuelle moyenne au départ, en euros de l'année de référence. */
	renteMoyenne: number;
	/** Pension par répartition mensuelle moyenne au départ. */
	pensionMoyenne: number;
}

export interface ProjectionCapitalisation {
	annees: AnneeCapitalisation[];
	generations: GenerationCapitalisation[];
}

const AGE_ULTIME = 110;

/**
 * Prix d'un euro de rente annuelle versé à vie à partir d'un âge, une année donnée : la somme des
 * chances de survie de chaque année à venir, ramenée à aujourd'hui au rendement du fonds.
 * La survie est celle des pyramides projetées, femmes et hommes confondus : une rente au même
 * tarif pour les deux sexes.
 */
export function facteurDeRente(
	pyramides: PyramidesProjetees,
	annee: number,
	age: number,
	rendement: number,
): number {
	const connues = Object.keys(pyramides).map(Number);
	const premiere = Math.min(...connues);
	const derniere = Math.max(...connues);
	const effectif = (p: Pyramide, a: number) =>
		(p.femmes[a] ?? 0) + (p.hommes[a] ?? 0);
	const dernierAge = (pyramides[premiere] as Pyramide).femmes.length - 1;
	// Chance d'être encore là un an plus tard. La dernière classe d'âge est ouverte : au-delà,
	// on garde la dernière chance mesurable.
	const survie = (y: number, a: number) => {
		const an = Math.max(premiere, Math.min(derniere - 1, y));
		const depart = Math.min(a, dernierAge - 2);
		const avant = effectif(pyramides[an] as Pyramide, depart);
		const apres = effectif(pyramides[an + 1] as Pyramide, depart + 1);
		return avant > 0 ? Math.min(1, apres / avant) : 0;
	};
	let facteur = 0;
	let vivant = 1;
	let actualisation = 1;
	for (let a = age; a < AGE_ULTIME && vivant > 1e-6; a++) {
		facteur += vivant * actualisation;
		vivant *= survie(annee + a - age, a);
		actualisation /= 1 + rendement;
	}
	return facteur;
}

/**
 * Projette l'étage par capitalisation sur la population d'un scénario préparé : versements à
 * partir de l'année d'effet, rentes de ceux qui partent ensuite, encours du fonds.
 */
export function projeterCapitalisation(
	prep: Preparation,
	c: Capitalisation,
): ProjectionCapitalisation {
	const { population, options } = prep;
	const n = population.length;
	const facteurs = new Map<number, number>();
	const facteur = (annee: number, age: number) => {
		const cle = annee * 200 + age;
		let f = facteurs.get(cle);
		if (f === undefined) {
			f = facteurDeRente(options.pyramides, annee, age, c.rendement);
			facteurs.set(cle, f);
		}
		return f;
	};
	const salaire = (k: number, annee: number) => {
		const carriere = (population[k] as Individu).carriere;
		const premiere = carriere.annees[0]?.annee ?? annee + 1;
		return carriere.annees[annee - premiere]?.salaireBrut ?? 0;
	};
	/** Le compte d'un individu une année de plus : il rapporte, puis reçoit le versement de l'année. */
	const avancer = (capital: number, k: number, annee: number) =>
		capital * (1 + c.rendement) + c.taux * salaire(k, annee);

	// Rente de chacun : son compte à la veille du départ, converti au prix de la rente à son âge.
	const rentes = new Float64Array(n);
	const parGeneration = new Map<
		number,
		{ n: number; rente: number; pension: number }
	>();
	for (let k = 0; k < n; k++) {
		const naissance = (population[k] as Individu).carriere.anneeNaissance;
		const p = prep.pensions[k] as Pension;
		const depart = p.liquidation.annee;
		let capital = 0;
		for (let annee = options.anneeEffet; annee < depart; annee++)
			capital = avancer(capital, k, annee);
		if (capital > 0) rentes[k] = capital / facteur(depart, depart - naissance);
		let g = parGeneration.get(naissance);
		if (!g) {
			g = { n: 0, rente: 0, pension: 0 };
			parGeneration.set(naissance, g);
		}
		g.n++;
		g.rente += (rentes[k] as number) / 12;
		g.pension += p.mensuelleBrute;
	}

	const comptes = new Float64Array(n);
	const annees: AnneeCapitalisation[] = [];
	for (let annee = options.debut; annee <= options.fin; annee++) {
		const poids = poidsDeLAnnee(prep, annee);
		const ligne = { annee, versements: 0, rentes: 0, encours: 0, rentiers: 0 };
		for (let k = 0; k < n; k++) {
			const naissance = (population[k] as Individu).carriere.anneeNaissance;
			const depart = (prep.pensions[k] as Pension).liquidation.annee;
			const w = poids[k] as number;
			if (annee < depart) {
				if (annee < options.anneeEffet) continue;
				comptes[k] = avancer(comptes[k] as number, k, annee);
				ligne.versements += w * c.taux * salaire(k, annee);
				ligne.encours += w * (comptes[k] as number);
				continue;
			}
			const rente = rentes[k] as number;
			if (rente === 0 || w === 0) continue;
			ligne.rentiers += w;
			ligne.rentes += w * rente;
			// Réserve de la rente en fin d'année : ce qu'il faut pour la servir à partir de l'an prochain.
			ligne.encours +=
				w * rente * (facteur(annee, annee - naissance) - 1) * (1 + c.rendement);
		}
		annees.push(ligne);
	}
	return {
		annees,
		generations: [...parGeneration.entries()]
			.sort(([x], [y]) => x - y)
			.map(([generation, g]) => ({
				generation,
				renteMoyenne: g.rente / g.n,
				pensionMoyenne: g.pension / g.n,
			})),
	};
}

/**
 * Reporte la capitalisation dans l'équation du système par répartition : la part des versements
 * prise sur les cotisations lui manque dès la première année. Les rentes sont payées par le fonds,
 * hors de l'équation.
 */
export function appliquerCapitalisation(
	annees: AnneeSysteme[],
	projection: ProjectionCapitalisation,
	c: Capitalisation,
): AnneeSysteme[] {
	return annees.map((a) => {
		const x = projection.annees.find((y) => y.annee === a.annee);
		if (!x) return a;
		const detournees = x.versements * c.partDetournee;
		return {
			...a,
			cotisations: a.cotisations - detournees,
			ressources: a.ressources - detournees,
			solde: a.solde - detournees,
			soldeHorsEtat: a.soldeHorsEtat - detournees,
			cotisationsDetournees: detournees,
		};
	});
}
