import type { AnneeProjetee } from "./projection.ts";
import data from "./reserve.data.json" with { type: "json" };
import type { AnneeSysteme } from "./systeme.ts";

/**
 * La réserve d'un régime : ce qu'il a mis de côté les années d'excédent, placé, et où il puise les
 * années de déficit. Elle ne change les droits de personne ; elle dit combien de temps un régime
 * peut verser plus qu'il ne reçoit.
 */
export type HypothesesReserve = {
	/** Réserve à la fin de l'année de départ, en euros de l'année de référence. */
	initiale: number;
	/** Rendement réel annuel des placements, net de frais. */
	rendement: number;
	/**
	 * Ressources et charges du régime l'année de départ, hors produits financiers. Le modèle ne
	 * simule qu'une partie des unes et des autres (ni réversions, ni gestion, ni transferts) : il
	 * n'en donne que l'évolution, appliquée à ces niveaux observés.
	 */
	ressources: number;
	charges: number;
};

export type AnneeReserve = {
	annee: number;
	ressources: number;
	charges: number;
	/** Ressources moins charges, avant les produits des placements. */
	soldeTechnique: number;
	/** Ce que la réserve de la fin de l'année précédente a rapporté. */
	produitsFinanciers: number;
	/** Réserve en fin d'année ; jamais négative, un régime sans réserve ne peut pas emprunter. */
	reserve: number;
	/** La réserve en mois de charges de l'année. */
	moisDeCharges: number;
	/** Ce qui manque une fois la réserve vide : à trouver en cotisations ou en pensions. */
	manque: number;
};

/** Ce que le modèle sait d'une année du régime : seule son évolution d'une année à l'autre sert. */
export type FluxRegime = {
	annee: number;
	cotisations: number;
	pensions: number;
};

/** Cotisations et pensions de l'étage complémentaire d'une projection : le total moins la base. */
export function fluxComplementaire(annees: AnneeProjetee[]): FluxRegime[] {
	return annees.map((a) => ({
		annee: a.annee,
		cotisations: a.cotisations - a.cotisationsBase,
		pensions: a.pensions - a.pensionsBase,
	}));
}

/**
 * Flux d'un scénario cadrés sur une projection publiée : avec le droit en vigueur, le rapport des
 * pensions aux cotisations suit `chargesSurRessources` (seule son évolution compte) ; le scénario
 * s'en écarte comme il s'écarte du droit en vigueur dans le modèle.
 */
export function cadrerFlux(
	reference: FluxRegime[],
	scenario: FluxRegime[],
	chargesSurRessources: Readonly<Record<number, number>>,
): FluxRegime[] {
	const base = reference[0];
	if (!base) return [];
	const cadre0 = chargesSurRessources[base.annee];
	return scenario.map((s, k) => {
		const r = reference[k] ?? s;
		const cadre = chargesSurRessources[s.annee];
		const pensionsDeReference =
			cadre0 && cadre && base.cotisations
				? r.cotisations * (base.pensions / base.cotisations) * (cadre / cadre0)
				: r.pensions;
		return {
			annee: s.annee,
			cotisations: s.cotisations,
			pensions: r.pensions
				? pensionsDeReference * (s.pensions / r.pensions)
				: pensionsDeReference,
		};
	});
}

/**
 * Fait vivre la réserve d'un régime le long d'une projection. La première année des flux est
 * l'année de départ : la réserve y vaut `initiale`. Chaque année suivante, la réserve de la veille
 * rapporte, puis le solde technique s'y ajoute ou s'en retranche.
 */
export function projeterReserve(
	flux: FluxRegime[],
	h: HypothesesReserve,
): AnneeReserve[] {
	const base = flux[0];
	if (!base) return [];
	let reserve = h.initiale;
	return flux.map((f, k) => {
		const ressources =
			h.ressources * (base.cotisations ? f.cotisations / base.cotisations : 1);
		const charges =
			h.charges * (base.pensions ? f.pensions / base.pensions : 1);
		const soldeTechnique = ressources - charges;
		let produitsFinanciers = 0;
		let manque = 0;
		if (k > 0) {
			produitsFinanciers = reserve * h.rendement;
			const suite = reserve + produitsFinanciers + soldeTechnique;
			manque = Math.max(0, -suite);
			reserve = Math.max(0, suite);
		}
		return {
			annee: f.annee,
			ressources,
			charges,
			soldeTechnique,
			produitsFinanciers,
			reserve,
			moisDeCharges: charges > 0 ? (reserve / charges) * 12 : 0,
			manque,
		};
	});
}

type Source = { titre: string; url: string; date: string };

/**
 * La réserve de l'Agirc-Arrco telle que le régime la publie, et l'hypothèse de rendement réel que
 * les partenaires sociaux retiennent pour leurs propres projections (data/references/reserves.json).
 */
export const RESERVE_AGIRC_ARRCO: HypothesesReserve & {
	/** Année des comptes observés. */
	annee: number;
	/** Règle de pilotage du régime : la réserve ne doit jamais passer sous ce nombre de mois de prestations. */
	plancherMois: number;
	horizonAnnees: number;
	/** Pensions rapportées aux salaires dans la projection du COR, par année : le cadrage du droit en vigueur. */
	chargesSurRessources: Readonly<Record<string, number>>;
	sources: Record<
		"reserve" | "ressources" | "charges" | "rendement" | "regle" | "cadrage",
		Source
	>;
} = data.agircArrco;

/**
 * Réserves et dette du système entier, et le taux réel qu'elles rapportent ou coûtent
 * (data/references/reserves.json, scripts/build-reserves.ts).
 */
export const PATRIMOINE_SYSTEME: {
	/** Année des stocks observés : la projection commence l'année suivante. */
	annee: number;
	/** Réserves de tous les régimes et du FRR en fin d'année, en euros de l'année de référence. */
	reserves: number;
	/** Dette retraite portée par la Cades en fin d'année, en euros de l'année de référence. */
	dette: number;
	/** Taux réel des réserves comme de la dette, par année : la croissance réelle du salaire moyen. */
	taux: Readonly<Record<string, number>>;
	sources: Record<"reserves" | "dette" | "taux" | "croissance", Source>;
} = data.systeme;

/**
 * Ajoute à chaque année du système ses intérêts : la situation patrimoniale de la fin de l'année
 * précédente rapporte (ou coûte, quand elle est négative) le taux de l'année, puis le solde de
 * l'année et ces intérêts s'y ajoutent. Le besoin de financement part donc en dette, et cette dette
 * coûte à son tour. Un taux unique pour les réserves et la dette : seule la situation nette compte,
 * sans dire quel régime puise dans la réserve d'un autre. Calculé pour chaque lecture du solde.
 */
export function ajouterInterets(
	annees: AnneeSysteme[],
	h: Pick<
		typeof PATRIMOINE_SYSTEME,
		"annee" | "reserves" | "dette" | "taux"
	> = PATRIMOINE_SYSTEME,
): AnneeSysteme[] {
	const depart = h.reserves - h.dette;
	let officiel = depart;
	let horsEtat = depart;
	let taux = 0;
	return annees.map((a) => {
		taux = h.taux[a.annee] ?? taux;
		const interets = { officiel: officiel * taux, horsEtat: horsEtat * taux };
		// Une année déjà passée (avant la fin des stocks observés) ne porte pas d'intérêts projetés.
		if (a.annee <= h.annee) {
			interets.officiel = 0;
			interets.horsEtat = 0;
		} else {
			officiel += a.solde + interets.officiel;
			horsEtat += a.soldeHorsEtat + interets.horsEtat;
		}
		return {
			...a,
			interets,
			situationPatrimoniale: { officiel, horsEtat },
		};
	});
}
