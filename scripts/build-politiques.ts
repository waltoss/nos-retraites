/**
 * Extrait de data/references/elasticites.json ce que l'interface montre des politiques familiales :
 * la fourchette d'effet de chaque famille de politiques sur la natalité, et les études lues en texte complet.
 * Les fourchettes sont des lectures de la littérature, marquées comme extrapolations dans la source.
 */
import reference from "../data/references/elasticites.json" with {
	type: "json",
};

const FAMILLES = ["accueilJeunesEnfants", "congeParental", "aidesFinancieres"];
const familles = reference.synthese.familles
	.filter((f) => FAMILLES.includes(f.famille))
	.map((f) => ({
		id: f.famille,
		unite: f.leverDeReference,
		effet: f.effetSurEnfantsParFemme as {
			bas: number;
			central: number;
			haut: number;
		},
		nature: f.natureDominante,
		delai: f.delaiDEffet,
		base: f.baseDeLaFourchette,
		reserves: f.reserves,
	}));
const etudes = reference.estimations
	.filter(
		(e) => FAMILLES.includes(e.famille) && e.acces.startsWith("texte complet"),
	)
	.map((e) => ({
		famille: e.famille,
		pays: e.pays,
		politique: e.politique,
		annee: String(e.annee),
		effet: e.effet,
		nature: e.nature,
		source: e.source,
		url: e.url,
	}));
await Bun.write(
	new URL("../apps/web/src/politiques.json", import.meta.url),
	`${JSON.stringify({ date: reference.date, familles, etudes }, null, "\t")}\n`,
);
console.log(
	`${familles.length} familles, ${etudes.length} études lues en texte complet`,
);
for (const f of familles)
	console.log(f.id, JSON.stringify(f.effet), "pour", f.unite);
