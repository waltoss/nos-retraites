import type { Projection } from "./projection.ts";
import data from "./systeme/cor.data.json" with { type: "json" };

/** Totaux publiés du système entier, une année : la cible du bloc résiduel. */
export interface AnneeCadrage {
	pib: number;
	depenses: number;
	ressources: number;
	/** Contributions et subventions d'équilibre de l'État, comprises dans les ressources. */
	contributionsEtat: number;
	/**
	 * Dépenses des régimes alignés sur le régime général (Cnav, indépendants, salariés agricoles) :
	 * les seuls, hors du privé simulé, à suivre toutes ses règles de calcul.
	 */
	depensesAlignes?: number;
}

export interface Cadrage {
	/** Part des cotisations dans les ressources, supposée constante. */
	partCotisations: number;
	annees: Readonly<Record<number, AnneeCadrage>>;
}

/** Projections du COR de juin 2026, en euros de l'année de référence (scripts/build-systeme.ts). */
export const CADRAGE_COR: Cadrage = {
	partCotisations: data.partCotisations,
	annees: data.annees as unknown as Record<number, AnneeCadrage>,
};

/** L'équation du système entier, une année, en euros de l'année de référence. */
export interface AnneeSysteme {
	annee: number;
	pib: number;
	depenses: number;
	cotisations: number;
	autresRessources: number;
	ressources: number;
	/** Ressources moins dépenses, en convention officielle : négatif, c'est un besoin de financement. */
	solde: number;
	/** Le même solde sans les contributions et subventions d'équilibre de l'État. */
	soldeHorsEtat: number;
}

/**
 * Étend un scénario simulé sur le privé au système entier.
 *
 * Avec la loi actuelle, les totaux sont ceux du cadrage : le bloc résiduel est ce qui manque au privé.
 * Dans un scénario, le privé bouge comme le moteur le calcule, et le bloc résiduel réagit selon ce
 * que le scénario change :
 * - les régimes alignés sur le régime général suivent toutes ses règles, donc les pensions de base du scénario ;
 * - les autres régimes (fonction publique, régimes spéciaux, indépendants non alignés, autres
 *   complémentaires) ne suivent que les règles communes à tous (âge, durée, revalorisation, décote,
 *   droits familiaux, emploi, démographie) : ils réagissent comme les pensions de base de la
 *   projection `universel`, le même scénario sans ses règles propres au privé ;
 * - les cotisations des autres régimes suivent aussi cette projection : une hausse du taux du privé
 *   ne s'y applique pas.
 * Les autres ressources, dont les versements de l'État, et le PIB suivent la masse des salaires du privé.
 *
 * Avec `fonctionPublique`, les pensions des fonctionnaires civils de l'État, des collectivités et des
 * hôpitaux sont celles de leur propre projection. Leurs cotisations restent dans le bloc résiduel :
 * le nombre de postes ne dépend pas de l'âge de départ, et un départ plus tardif retarde une embauche.
 */
export function computeSysteme(
	reference: Projection,
	scenario: Projection,
	cadrage: Cadrage = CADRAGE_COR,
	universel: Projection = scenario,
	fonctionPublique?: { reference: Projection; scenario: Projection },
): AnneeSysteme[] {
	const resultat: AnneeSysteme[] = [];
	scenario.annees.forEach((s, i) => {
		const r = reference.annees[i];
		const u = universel.annees[i] ?? s;
		const c = cadrage.annees[s.annee];
		if (!r || !c) return;
		const rapport = (x: number, y: number) => (y > 0 ? x / y : 1);
		// Les fonctionnaires simulés sortent du bloc résiduel : leurs pensions bougent comme le moteur les calcule.
		const publicReference =
			fonctionPublique?.reference.annees[i]?.pensions ?? 0;
		const publicScenario =
			fonctionPublique?.scenario.annees[i]?.pensions ?? publicReference;
		const residuelDepenses = Math.max(
			0,
			c.depenses - r.pensions - publicReference,
		);
		// Sans la répartition par groupe de régimes, tout le bloc suit les règles communes.
		const residuelAlignes = Math.min(
			residuelDepenses,
			Math.max(0, (c.depensesAlignes ?? 0) - r.pensionsBase),
		);
		const depenses =
			c.depenses +
			(s.pensions - r.pensions) +
			(publicScenario - publicReference) +
			residuelAlignes * (rapport(s.pensionsBase, r.pensionsBase) - 1) +
			(residuelDepenses - residuelAlignes) *
				(rapport(u.pensionsBase, r.pensionsBase) - 1);
		const cotisationsReference = cadrage.partCotisations * c.ressources;
		const residuelCotisations = Math.max(
			0,
			cotisationsReference - r.cotisations,
		);
		const cotisations =
			cotisationsReference +
			(s.cotisations - r.cotisations) +
			residuelCotisations * (rapport(u.cotisationsBase, r.cotisationsBase) - 1);
		// Les autres ressources (CSG, impôts affectés) et le PIB suivent la masse des salaires :
		// plus de monde au travail, c'est aussi plus d'impôts et plus de richesse produite.
		const activite = rapport(
			s.cotisants * s.salaireMoyen,
			r.cotisants * r.salaireMoyen,
		);
		const autresRessources = (c.ressources - cotisationsReference) * activite;
		const ressources = cotisations + autresRessources;
		resultat.push({
			annee: s.annee,
			pib: c.pib * activite,
			depenses,
			cotisations,
			autresRessources,
			ressources,
			solde: ressources - depenses,
			soldeHorsEtat: ressources - depenses - c.contributionsEtat,
		});
	});
	return resultat;
}
