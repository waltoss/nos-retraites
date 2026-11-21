import type { Champ, Pyramide } from "../ponderation.ts";
import data from "./france.data.json" with { type: "json" };

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

/**
 * Salariés et anciens salariés du privé : part de chaque âge qui relève du champ,
 * réglée sur les cotisants et les retraités de l'Agirc-Arrco.
 */
export const CHAMP_PRIVE: Champ = {
	nom: "Salariés du privé",
	part: (age, sexe) => {
		const v = parts[sexe];
		return v[Math.max(0, Math.min(v.length - 1, age))] ?? 0;
	},
};
