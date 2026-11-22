import data from "./systeme/ressources.data.json" with { type: "json" };
import type { AnneeSysteme } from "./systeme.ts";

/**
 * Ce qu'une règle d'évolution connaît d'une année : le scénario rapporté à la loi actuelle.
 * Tout ce qui sert à suivre un poste de ressources plus finement s'ajoute ici.
 */
export interface ContexteRessources {
	annee: number;
	/** Masse des salaires du privé, scénario sur loi actuelle. */
	masseSalariale: number;
	/** Masse des pensions de tous les régimes, scénario sur loi actuelle. */
	pensions: number;
}

/** Ce qu'un poste de ressources suit dans un scénario. */
export type Assiette = "masseSalariale" | "pensions" | "inchangee";

/** Évolution d'un poste dans un scénario, en rapport à la loi actuelle : une fonction par assiette. */
export const ASSIETTES: Record<
	Assiette,
	{ libelle: string; rapport: (c: ContexteRessources) => number }
> = {
	masseSalariale: {
		libelle: "la masse des salaires du privé",
		rapport: (c) => c.masseSalariale,
	},
	pensions: { libelle: "la masse des pensions", rapport: (c) => c.pensions },
	inchangee: { libelle: "rien : il ne bouge pas", rapport: () => 1 },
};

export type PosteId =
	| "contributionsEquilibre"
	| "subventionsEquilibre"
	| "csg"
	| "itafActivite"
	| "itafConsommation"
	| "autresItaf"
	| "transfertsCnaf"
	| "transfertsUnedic"
	| "autresTransferts"
	| "autresProduits";

/** Un poste des ressources hors cotisations, tel que le COR le publie. */
export interface PosteRessources {
	id: PosteId;
	libelle: string;
	/** Montant de la dernière année observée, en milliards d'euros courants. */
	milliards: number;
	/** Part du poste dans les ressources hors cotisations et hors produits financiers. */
	part: number;
	assiette: Assiette;
}

const LIBELLES: Record<PosteId, string> = {
	contributionsEquilibre:
		"Contributions d'équilibre de l'État et des autres employeurs publics",
	subventionsEquilibre: "Subventions d'équilibre de l'État",
	csg: "CSG",
	itafActivite:
		"Impôts et taxes sur les revenus d'activité (forfait social, taxe sur les salaires)",
	itafConsommation: "Impôts et taxes sur la consommation (dont TVA)",
	autresItaf: "Autres impôts et taxes affectés",
	transfertsCnaf: "Transferts de la branche famille",
	transfertsUnedic: "Transferts de l'assurance chômage",
	autresTransferts: "Autres transferts",
	autresProduits: "Autres produits",
};

/**
 * Hypothèse d'aujourd'hui : chaque poste suit la masse des salaires du privé, comme l'ensemble
 * le faisait avant d'être détaillé. Changer l'assiette d'un poste suffit à le suivre autrement.
 */
const ASSIETTE_DES_POSTES: Partial<Record<PosteId, Assiette>> = {};

const sommeDesParts = data.postes.reduce((t, p) => t + p.part, 0);

/** Structure des ressources hors cotisations (COR, tableau 2.2 ; scripts/build-systeme.ts). */
export const POSTES_RESSOURCES: PosteRessources[] = data.postes.map((p) => ({
	id: p.id as PosteId,
	libelle: LIBELLES[p.id as PosteId],
	milliards: p.milliards,
	part: p.part / sommeDesParts,
	assiette: ASSIETTE_DES_POSTES[p.id as PosteId] ?? "masseSalariale",
}));

export const SOURCE_RESSOURCES = {
	source: data.source,
	url: data.url,
	date: data.date,
	annee: data.annee,
	note: data.note,
	cotisationsMilliards: data.cotisationsMilliards,
};

/** Répartit les ressources hors cotisations de la loi actuelle entre les postes, chacun suivant son assiette. */
export function repartirRessources(
	total: number,
	c: ContexteRessources,
	postes: PosteRessources[] = POSTES_RESSOURCES,
): Record<PosteId, number> {
	const resultat = {} as Record<PosteId, number>;
	for (const p of postes)
		resultat[p.id] = total * p.part * ASSIETTES[p.assiette].rapport(c);
	return resultat;
}

/**
 * Une ressource nouvelle : un objet de données, calculé par la fonction de son type.
 * Pour la simuler plus finement (une assiette et un taux, un effet sur l'emploi), on ajoute
 * un type et sa fonction dans CALCULS_RESSOURCES, sans toucher au reste.
 */
export type RessourceNouvelle = {
	type: "forfait";
	/** Montant de l'année d'effet, en euros de l'année de référence ; négatif pour une ressource en moins. */
	montant: number;
	anneeEffet: number;
};

type Calcul<T extends RessourceNouvelle["type"]> = (
	mesure: Extract<RessourceNouvelle, { type: T }>,
	annee: AnneeSysteme,
	/** L'année d'effet de la mesure, dans le même scénario. */
	depart: AnneeSysteme,
) => number;

export const CALCULS_RESSOURCES: {
	[T in RessourceNouvelle["type"]]: Calcul<T>;
} = {
	// Un montant annoncé, qui garde ensuite la même part de la richesse produite.
	forfait: (m, annee, depart) => (m.montant * annee.pib) / depart.pib,
};

/** Ajoute des ressources nouvelles à un scénario étendu au système entier. */
export function ajouterRessources(
	annees: AnneeSysteme[],
	mesures: RessourceNouvelle[] = [],
): AnneeSysteme[] {
	if (mesures.length === 0) return annees;
	return annees.map((a) => {
		let nouvelles = 0;
		for (const m of mesures) {
			const depart = annees.find((x) => x.annee === m.anneeEffet);
			if (!depart || a.annee < m.anneeEffet) continue;
			nouvelles += CALCULS_RESSOURCES[m.type](m, a, depart);
		}
		return {
			...a,
			ressourcesNouvelles: a.ressourcesNouvelles + nouvelles,
			autresRessources: a.autresRessources + nouvelles,
			ressources: a.ressources + nouvelles,
			solde: a.solde + nouvelles,
			soldeHorsEtat: a.soldeHorsEtat + nouvelles,
		};
	});
}
