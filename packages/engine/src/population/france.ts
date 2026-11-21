import type { Champ, Pyramide } from "../ponderation.ts";
import data from "./france.data.json" with { type: "json" };
import projection from "./projection.data.json" with { type: "json" };

/** Généré par scripts/build-population.ts à partir de data/references/population.json. */
const decale = (v: number[]): number[] => [
	...new Array<number>(data.ageMin).fill(0),
	...v,
];

/** Population de la France par sexe et âge au 1er janvier de l'année de référence (Insee). */
export const PYRAMIDE_FRANCE: Pyramide = {
	annee: data.annee,
	femmes: decale(data.femmes),
	hommes: decale(data.hommes),
};

const parts = {
	F: decale(data.partPrive.femmes),
	H: decale(data.partPrive.hommes),
};

/** Âge à partir duquel presque tous ceux qui ont des droits sont retraités. */
const AGE_TOUS_RETRAITES = 68;
const DERNIER_AGE_DU_PALIER = 75;
const palier = (v: number[]) => {
	const ages = v.slice(AGE_TOUS_RETRAITES, DERNIER_AGE_DU_PALIER + 1);
	return ages.reduce((t, x) => t + x, 0) / ages.length;
};
const paliers = { F: palier(parts.F), H: palier(parts.H) };

/**
 * Salariés et anciens salariés du privé : part de chaque âge qui relève du champ,
 * réglée sur les cotisants et les retraités de l'Agirc-Arrco.
 * Chez les retraités la part suit la génération : celle qui a 85 ans en 2060 garde la part
 * qu'avaient en 2026 les jeunes retraités, et non celle des personnes de 85 ans en 2026,
 * moins souvent passées par le salariat.
 */
export const CHAMP_PRIVE: Champ = {
	nom: "Salariés du privé",
	part: (age, sexe, annee = data.annee) => {
		const v = parts[sexe];
		const borne = (a: number) => v[Math.max(0, Math.min(v.length - 1, a))] ?? 0;
		if (age < AGE_TOUS_RETRAITES || annee <= data.annee) return borne(age);
		const ageDeReference = age - (annee - data.annee);
		return ageDeReference >= AGE_TOUS_RETRAITES
			? borne(ageDeReference)
			: paliers[sexe];
	},
};

/** Population projetée par l'Insee (scénario central, celui du COR), de l'année de référence à 2070. */
export const PYRAMIDES_PROJETEES: Readonly<Record<number, Pyramide>> =
	Object.fromEntries(
		Object.entries(projection.annees).map(([annee, p]) => [
			Number(annee),
			{
				annee: Number(annee),
				femmes: decale(p.femmes),
				hommes: decale(p.hommes),
			},
		]),
	);

/** Réglages démographiques d'un scénario ; absents, ce sont ceux du scénario central de l'Insee. */
export interface Demographie {
	/** Nombre d'enfants par femme à terme. */
	fecondite?: number;
	/** Entrées nettes sur le territoire, par an. */
	soldeMigratoire?: number;
}

/** Niveaux bas, central et haut des variantes de l'Insee : les réglages ne peuvent pas en sortir. */
export const NIVEAUX_DEMOGRAPHIE = projection.niveaux;

type Ecarts = Record<string, { femmes: number[]; hommes: number[] }>;

/**
 * Population projetée pour des réglages démographiques donnés, par interpolation
 * entre le scénario central et les variantes haute et basse de l'Insee.
 * Les effets de la fécondité et des migrations sont supposés s'additionner.
 */
export function pyramidesProjetees(
	d: Demographie = {},
): Readonly<Record<number, Pyramide>> {
	const termes: { ecarts: Ecarts; poids: number }[] = [];
	const ajoute = (
		valeur: number | undefined,
		n: { bas: number; central: number; haut: number },
		bas: Ecarts,
		haut: Ecarts,
	) => {
		if (valeur === undefined || valeur === n.central) return;
		const borne = Math.max(n.bas, Math.min(n.haut, valeur));
		termes.push(
			borne > n.central
				? { ecarts: haut, poids: (borne - n.central) / (n.haut - n.central) }
				: { ecarts: bas, poids: (n.central - borne) / (n.central - n.bas) },
		);
	};
	const e = projection.ecarts;
	ajoute(
		d.fecondite,
		projection.niveaux.fecondite,
		e.feconditeBasse,
		e.feconditeHaute,
	);
	ajoute(
		d.soldeMigratoire,
		projection.niveaux.soldeMigratoire,
		e.soldeMigratoireBas,
		e.soldeMigratoireHaut,
	);
	if (termes.length === 0) return PYRAMIDES_PROJETEES;
	return Object.fromEntries(
		Object.entries(projection.annees).map(([annee, p]) => {
			const ajuste = (cle: "femmes" | "hommes") =>
				decale(
					p[cle].map((n, i) =>
						Math.max(
							0,
							n +
								termes.reduce(
									(t, x) =>
										t + x.poids * ((x.ecarts[annee]?.[cle][i] as number) ?? 0),
									0,
								),
						),
					),
				);
			return [
				Number(annee),
				{
					annee: Number(annee),
					femmes: ajuste("femmes"),
					hommes: ajuste("hommes"),
				},
			];
		}),
	);
}
