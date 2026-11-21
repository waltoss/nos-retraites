import type { Projection } from "./projection.ts";
import data from "./systeme/cor.data.json" with { type: "json" };

/** Totaux publiés du système entier, une année : la cible du bloc résiduel. */
export interface AnneeCadrage {
	pib: number;
	depenses: number;
	ressources: number;
	/** Contributions et subventions d'équilibre de l'État, comprises dans les ressources. */
	contributionsEtat: number;
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
 * Dans un scénario, le privé bouge comme le moteur le calcule, et le bloc résiduel est supposé réagir
 * comme le régime de base du privé (mêmes variations relatives de pensions et de cotisations).
 * Les autres ressources, dont les versements de l'État, et le PIB suivent la masse des salaires du privé.
 */
export function computeSysteme(
	reference: Projection,
	scenario: Projection,
	cadrage: Cadrage = CADRAGE_COR,
): AnneeSysteme[] {
	const resultat: AnneeSysteme[] = [];
	scenario.annees.forEach((s, i) => {
		const r = reference.annees[i];
		const c = cadrage.annees[s.annee];
		if (!r || !c) return;
		const rapport = (x: number, y: number) => (y > 0 ? x / y : 1);
		const residuelDepenses = Math.max(0, c.depenses - r.pensions);
		const depenses =
			c.depenses +
			(s.pensions - r.pensions) +
			residuelDepenses * (rapport(s.pensionsBase, r.pensionsBase) - 1);
		const cotisationsReference = cadrage.partCotisations * c.ressources;
		const residuelCotisations = Math.max(
			0,
			cotisationsReference - r.cotisations,
		);
		const cotisations =
			cotisationsReference +
			(s.cotisations - r.cotisations) +
			residuelCotisations * (rapport(s.cotisationsBase, r.cotisationsBase) - 1);
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
