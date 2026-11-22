import type { AnneeProjetee } from "./projection.ts";
import data from "./reserve.data.json" with { type: "json" };

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
