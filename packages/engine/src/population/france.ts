import baremes from "../baremes/france.data.json" with { type: "json" };
import type { Champ, Pyramide } from "../ponderation.ts";
import {
	type Carriere,
	estIndependant,
	estSalarie,
	moisParEtat,
} from "../types.ts";
import { partFonctionPublique } from "./fonctionPublique.ts";
import data from "./france.data.json" with { type: "json" };
import mortalite from "./mortalite.data.json" with { type: "json" };
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

const TRIMESTRES_PAR_ENFANT = baremes.cnav.mdaParEnfant;
/** Âge avant lequel on compte les années au régime général d'une vie : après, beaucoup sont déjà partis. */
const AGE_FIN_DUREE = 62;
const DUREES = new WeakMap<Carriere, { annees: number; ailleurs: boolean }>();

/**
 * Durée d'une carrière au régime général avant 62 ans, en années (-1 pour qui a été artisan ou
 * commerçant), et si elle a aussi des années dans un régime non simulé. C'est ce qui rapproche un
 * fonctionnaire passé par le privé de l'individu du privé qu'il remplace : la même part de carrière
 * au régime général, et de préférence une carrière qui se poursuit ailleurs.
 * Mesure approchée, sans calculer le compte : un trimestre par trois mois d'emploi, de chômage ou
 * de maladie d'une année de salarié, quatre pour une année d'AVPF, et les trimestres pour enfants
 * des mères, que le régime général n'accorde pas à qui touche une pension de fonctionnaire.
 */
export function dureeAuRegimeGeneral(carriere: Carriere): {
	annees: number;
	ailleurs: boolean;
} {
	let d = DUREES.get(carriere);
	if (d === undefined) {
		d = { annees: 0, ailleurs: false };
		const fin = carriere.anneeNaissance + AGE_FIN_DUREE;
		let trimestres = 0;
		for (const a of carriere.annees) {
			if (estIndependant(a)) {
				trimestres = -1;
				break;
			}
			if (a.annee >= fin) continue;
			if (estSalarie(a)) {
				const m = moisParEtat(a);
				trimestres += a.avpf
					? 4
					: Math.min(4, Math.floor((m.emploi + m.chomage + m.maladie) / 3));
			} else if (a.affiliation === "autre" && a.etat === "emploi")
				d.ailleurs = true;
		}
		if (trimestres >= 0 && carriere.sexe === "F" && !carriere.fonctionPublique)
			trimestres += TRIMESTRES_PAR_ENFANT * carriere.enfants.length;
		d.annees = trimestres < 0 ? -1 : trimestres / 4;
		DUREES.set(carriere, d);
	}
	return d;
}

type ResteParDuree = {
	bornes: number[];
	femmes: number[][];
	hommes: number[][];
};
const reste = (data as { resteParDuree?: ResteParDuree }).resteParDuree;

/**
 * Tranche d'une carrière pour le retrait des doublons : son rang de durée au privé parmi les
 * bornes données, d'abord pour ceux qui ont des années ailleurs, puis pour les autres ; -1 pour
 * qui a été indépendant.
 */
export function trancheDeDuree(
	carriere: Carriere,
	bornes: readonly number[],
): number {
	const d = dureeAuRegimeGeneral(carriere);
	if (d.annees < 0) return -1;
	let k = 0;
	while (k < bornes.length && d.annees >= (bornes[k] as number)) k++;
	return d.ailleurs ? k : bornes.length + 1 + k;
}

/**
 * Ce qu'il reste du poids d'un individu du privé une fois retirés ceux que les fonctionnaires
 * passés par le privé représentent déjà, à âge, sexe et durée au privé comparables.
 */
function resteApresFonctionnaires(
	age: number,
	sexe: "F" | "H",
	carriere: Carriere | undefined,
): number {
	if (!reste || !carriere) return 1;
	const tranche = trancheDeDuree(carriere, reste.bornes);
	if (tranche < 0) return 1;
	const v = sexe === "F" ? reste.femmes : reste.hommes;
	const ligne = v[Math.max(0, Math.min(v.length - 1, age - data.ageMin))];
	return ligne?.[tranche] ?? 1;
}
const paliersReste = (() => {
	const moyenne = (v: number[][]) => {
		const n = 2 * ((reste?.bornes.length ?? 0) + 1);
		const t = new Array<number>(n).fill(0);
		for (let age = AGE_TOUS_RETRAITES; age <= DERNIER_AGE_DU_PALIER; age++)
			for (let k = 0; k < n; k++)
				(t[k] as number) += v[age - data.ageMin]?.[k] ?? 1;
		return t.map((x) => x / (DERNIER_AGE_DU_PALIER - AGE_TOUS_RETRAITES + 1));
	};
	return reste
		? { F: moyenne(reste.femmes), H: moyenne(reste.hommes) }
		: undefined;
})();

/**
 * Salariés et anciens salariés du privé : part de chaque âge qui relève du champ,
 * réglée sur les cotisants et les retraités de l'Agirc-Arrco.
 * Chez les retraités la part suit la génération : celle qui a 85 ans en 2060 garde la part
 * qu'avaient en 2026 les jeunes retraités, et non celle des personnes de 85 ans en 2026,
 * moins souvent passées par le salariat.
 *
 * La population est une : un fonctionnaire y pèse ce que pèse sa génération dans son régime, et ses
 * années de salarié comptent ici. Pour ne compter personne deux fois, les individus du privé de même
 * âge, de même sexe et de même durée au privé pèsent d'autant moins (`resteParDuree`).
 */
export const CHAMP_PRIVE: Champ = {
	nom: "Salariés du privé",
	affiliations: ["prive", "salarieAgricole"],
	regimes: ["cnav", "agircArrco"],
	aPart: ["sre", "cnracl", "militaire"],
	cellule: (carriere) => carriere.fonctionPublique?.regime ?? "",
	part: (age, sexe, annee = data.annee, carriere) => {
		const statut = carriere?.fonctionPublique;
		if (statut) return partFonctionPublique(statut.regime, sexe, annee - age);
		const v = parts[sexe];
		const borne = (a: number) => v[Math.max(0, Math.min(v.length - 1, a))] ?? 0;
		if (age < AGE_TOUS_RETRAITES || annee <= data.annee)
			return borne(age) * resteApresFonctionnaires(age, sexe, carriere);
		const ageDeReference = age - (annee - data.annee);
		if (ageDeReference >= AGE_TOUS_RETRAITES)
			return (
				borne(ageDeReference) *
				resteApresFonctionnaires(ageDeReference, sexe, carriere)
			);
		const tranche =
			carriere && reste ? trancheDeDuree(carriere, reste.bornes) : -1;
		return (
			paliers[sexe] * (tranche < 0 ? 1 : (paliersReste?.[sexe][tranche] ?? 1))
		);
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

/**
 * Chance d'être en vie à un âge donné, rapportée à celle de l'ensemble des personnes du même sexe,
 * selon le vingtième de pension (0 = les plus basses). Vaut 1 avant 60 ans.
 * D'après les tables de mortalité par niveau de vie de l'Insee, atténuées (scripts/build-mortalite.ts).
 */
export type SurvieRelative = (
	sexe: "F" | "H",
	vingtieme: number,
	age: number,
) => number;

export const SURVIE_SELON_PENSION: SurvieRelative = (sexe, vingtieme, age) => {
	if (age < mortalite.ageMin) return 1;
	const table = (sexe === "F" ? mortalite.femmes : mortalite.hommes)[
		Math.max(0, Math.min(19, vingtieme))
	] as number[];
	return table[Math.min(table.length - 1, age - mortalite.ageMin)] ?? 1;
};
