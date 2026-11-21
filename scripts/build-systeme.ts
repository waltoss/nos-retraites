/**
 * Cadrage du système de retraite entier (packages/engine/src/systeme/cor.data.json),
 * tiré des projections du COR de juin 2026, scénario de référence.
 *
 * Le moteur ne simule que les salariés du privé. Le reste du système (autres régimes,
 * réversion, autres ressources) est un bloc résiduel : la différence entre ces totaux
 * publiés et ce que le moteur calcule avec la loi actuelle.
 * Tout est converti en euros de l'année de référence avec l'indice des prix du COR.
 */
import reference from "../data/references/projections.json" with {
	type: "json",
};
import { BAREMES_FRANCE as B } from "../packages/engine/src/index.ts";

type Serie = { anneeDebut: number; anneeFin: number; valeurs: number[] };
const lire = (s: Serie, annee: number): number => {
	const v = s.valeurs[annee - s.anneeDebut];
	if (v === undefined)
		throw new Error(`Année ${annee} absente d'une série du COR`);
	return v;
};

const f = reference.projectionsFinancieresCOR;
const prix = reference.hypothesesEconomiquesCOR.prix.indice as Serie;
const pib = f.pib.valeurMdEUR.scenarioReference as Serie;
const ANNEE = B.anneeReference;
const FIN = 2070;

// Part des cotisations dans les ressources, la dernière année observée (hors produits financiers,
// comme les ressources en part de PIB). Le COR ne publie pas cette structure en projection.
const lignes = f.structureDesRessources.derniereAnneeObservee.lignes as [
	string,
	number,
	number,
][];
const ligne = (debut: string) => {
	const l = lignes.find(([nom]) => nom.startsWith(debut));
	if (!l) throw new Error(`Ligne « ${debut} » absente du tableau 2.2`);
	return l[1];
};
const partCotisations =
	ligne("Cotisations hors contribution") /
	(ligne("TOTAL ressources") - ligne("Produits financiers"));

const annees: Record<
	number,
	{
		pib: number;
		depenses: number;
		ressources: number;
		contributionsEtat: number;
	}
> = {};
for (let annee = ANNEE; annee <= FIN; annee++) {
	// Milliards d'euros courants ramenés en euros de l'année de référence.
	const reel = (lire(pib, annee) * lire(prix, ANNEE)) / lire(prix, annee);
	const part = (s: unknown) => lire(s as Serie, annee) * reel * 1e9;
	annees[annee] = {
		pib: Math.round(reel * 1e9),
		depenses: Math.round(part(f.depensesPartPIB.scenarioReference)),
		ressources: Math.round(part(f.ressourcesPartPIB.scenarioReference)),
		contributionsEtat: Math.round(
			part(
				f.tauxDePrelevementEtContributionEtat.contributionEtSubventionsEtat
					.scenarioReference,
			),
		),
	};
}

await Bun.write(
	new URL("../packages/engine/src/systeme/cor.data.json", import.meta.url),
	`${JSON.stringify(
		{
			source: f.source,
			url: f.url,
			date: f.date,
			champ: f.champ,
			convention:
				"Solde en convention EPR : les contributions et subventions d'équilibre de l'État comptent comme des ressources.",
			partCotisations: Number(partCotisations.toFixed(4)),
			annees,
		},
		null,
		"\t",
	)}\n`,
);
const a = annees[ANNEE];
const z = annees[FIN];
const md = (x: number) => (x / 1e9).toFixed(0);
console.log(
	`${ANNEE} : PIB ${md(a?.pib ?? 0)}, dépenses ${md(a?.depenses ?? 0)}, ressources ${md(a?.ressources ?? 0)}, dont État ${md(a?.contributionsEtat ?? 0)} Md€`,
);
console.log(
	`${FIN} : PIB ${md(z?.pib ?? 0)}, dépenses ${md(z?.depenses ?? 0)}, ressources ${md(z?.ressources ?? 0)}, dont État ${md(z?.contributionsEtat ?? 0)} Md€ | part des cotisations ${partCotisations.toFixed(3)}`,
);
