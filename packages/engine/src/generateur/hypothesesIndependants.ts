import donnees from "./hypothesesIndependants.data.json" with { type: "json" };

/**
 * Artisans et commerçants parmi les individus qui passent une partie de leur vie active hors du
 * salariat privé. `part` et `dureeRelative` sont des paramètres libres, réglés à la main sur
 * `scripts/backtest-independants.ts` ; `revenuRelatif` est lu dans une source
 * (`scripts/build-independants.ts`).
 */
export type HypothesesIndependants = {
	/** Part des individus qui ont une période d'indépendant, par sexe. */
	part: { F: number; H: number };
	/** Part de leurs années hors du salariat qui sont des années d'indépendant ; le reste relève d'un régime non simulé. */
	dureeRelative: number;
	/** Part des artisans ; les autres sont commerçants. */
	partArtisans: number;
	/**
	 * Revenu d'indépendant rapporté au salaire que le même individu aurait eu cette année-là :
	 * celui des indépendants hors auto-entrepreneurs jusqu'à la création du statut (`avant`), puis
	 * une pente jusqu'à la moyenne observée avec eux (`depuis`), gardée ensuite.
	 */
	revenuRelatif: {
		avant: number;
		classiques: number;
		depuis: number;
		avecAutoEntrepreneurs: number;
	};
};

/** Revenu relatif d'un indépendant une année donnée. */
export function revenuRelatif(
	h: HypothesesIndependants,
	annee: number,
): number {
	const r = h.revenuRelatif;
	if (annee <= r.avant) return r.classiques;
	if (annee >= r.depuis) return r.avecAutoEntrepreneurs;
	return (
		r.classiques +
		((r.avecAutoEntrepreneurs - r.classiques) * (annee - r.avant)) /
			(r.depuis - r.avant)
	);
}

export const HYPOTHESES_INDEPENDANTS: HypothesesIndependants = {
	part: donnees.part,
	dureeRelative: donnees.dureeRelative,
	partArtisans: donnees.partArtisans,
	revenuRelatif: donnees.revenuRelatif,
};
