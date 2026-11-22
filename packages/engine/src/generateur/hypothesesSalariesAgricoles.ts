import donnees from "./hypothesesSalariesAgricoles.data.json" with {
	type: "json",
};

/**
 * Salariés agricoles parmi les salariés du privé. Ils y sont déjà : la population est pondérée sur
 * les cotisants de l'Agirc-Arrco, qui les comptent. Ces hypothèses disent seulement lesquelles de
 * leurs années relèvent de la MSA ; elles ne changent ni un salaire ni une pension.
 * Trois paramètres libres (part par sexe, durée, recul), réglés à la main sur `scripts/backtest-salaries-agricoles.ts`.
 */
export type HypothesesSalariesAgricoles = {
	/** Part des individus qui ont une période de salarié agricole, par sexe, dans les générations anciennes. */
	part: { F: number; H: number };
	/**
	 * L'emploi agricole recule : la part est entière jusqu'à la première génération, puis baisse en
	 * ligne droite jusqu'à `rapport` fois sa valeur à la seconde, et y reste.
	 */
	recul: { de: number; a: number; rapport: number };
	/** Durée moyenne de cette période, en années ; elle se tire entre un an et le double de la moyenne. */
	dureeMoyenne: number;
};

/** Part d'une génération qui a une période de salarié agricole. */
export function partSalariesAgricoles(
	h: HypothesesSalariesAgricoles,
	sexe: "F" | "H",
	anneeNaissance: number,
): number {
	const { de, a, rapport } = h.recul;
	const avance = Math.max(0, Math.min(1, (anneeNaissance - de) / (a - de)));
	return h.part[sexe] * (1 + (rapport - 1) * avance);
}

export const HYPOTHESES_SALARIES_AGRICOLES: HypothesesSalariesAgricoles = {
	part: donnees.part,
	recul: donnees.recul,
	dureeMoyenne: donnees.dureeMoyenne,
};
