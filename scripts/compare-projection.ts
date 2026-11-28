/**
 * Recoupe la projection du droit en vigueur avec le COR : nombre de cotisants pour un retraité
 * à l'Agirc-Arrco (rapport de juin 2026, figure 2.7). Écrit apps/web/src/recoupement-projection.json.
 * À relancer après un calage ou un changement de pondération.
 */
import reference from "../data/references/projections.json" with {
	type: "json",
};
import recoupements from "../data/references/recoupements.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	computeSysteme,
	type Demographie,
	generatePopulationEntiere,
	PYRAMIDES_PROJETEES,
	pyramidesProjetees,
	runProjection,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
} from "../packages/engine/src/index.ts";

const cor =
	reference.projectionsFinancieresCOR.cnavEtAgircArrco.determinantsFigure2_7
		.rapportCotisantsRetraites["AGIRC-ARRCO"];
const population = generatePopulationEntiere(SCENARIO_REFERENCE, B);
const comptes = buildComptes(population, B);
const projeter = (d: Demographie = {}) =>
	runProjection(
		population,
		B,
		{},
		{
			debut: B.anneeReference,
			fin: 2070,
			pyramides:
				Object.keys(d).length === 0
					? PYRAMIDES_PROJETEES
					: pyramidesProjetees(d),
			champ: CHAMP_PRIVE,
			survie: SURVIE_SELON_PENSION,
			anneeEffet: 2028,
			comptes,
		},
	);
const projection = projeter();
const lignes = [2030, 2050, 2070].map((annee) => {
	const a = projection.annees.find((x) => x.annee === annee);
	if (!a) throw new Error(`Année ${annee} absente de la projection`);
	return {
		nom: `Cotisants pour un retraité en ${annee}`,
		modele: Number((a.cotisants / a.retraites).toFixed(2)),
		cible: Number((cor.valeurs[annee - cor.anneeDebut] as number).toFixed(2)),
	};
});

// Variantes démographiques : écart de solde tous régimes face au scénario central, en points de PIB.
const v = recoupements.variantesDemographiquesCOR;
const systemeReference = computeSysteme(projection, projection);
const variantes: [string, Demographie, Record<string, number>][] = [
	["Natalité à 1,70", { fecondite: 1.7 }, v.fecondite.haute_1_70.soldePartPIB],
	["Natalité à 1,20", { fecondite: 1.2 }, v.fecondite.basse_1_20.soldePartPIB],
	[
		"Solde migratoire à 230 000",
		{ soldeMigratoire: 230000 },
		v.soldeMigratoire.haut_230000.soldePartPIB,
	],
	[
		"Solde migratoire à 70 000",
		{ soldeMigratoire: 70000 },
		v.soldeMigratoire.bas_70000.soldePartPIB,
	],
];
const part = (annees: typeof systemeReference, annee: number) => {
	const a = annees.find((x) => x.annee === annee);
	if (!a) throw new Error(`Année ${annee} absente`);
	return (a.solde / a.pib) * 100;
};
const demographie = variantes.flatMap(([nom, d, cor]) => {
	const systeme = computeSysteme(projection, projeter(d));
	return [2050, 2070].map((annee) => ({
		nom: `${nom}, en ${annee}`,
		modele: Number(
			(part(systeme, annee) - part(systemeReference, annee)).toFixed(2),
		),
		cible: Number(
			(
				((cor[annee] as number) - (v.reference.soldePartPIB[annee] as number)) *
				100
			).toFixed(2),
		),
	}));
});
await Bun.write(
	new URL("../apps/web/src/recoupement-demographie.json", import.meta.url),
	`${JSON.stringify(demographie, null, "\t")}\n`,
);
for (const l of demographie)
	console.log(l.nom, "modèle", l.modele, "COR", l.cible);
await Bun.write(
	new URL("../apps/web/src/recoupement-projection.json", import.meta.url),
	`${JSON.stringify(lignes, null, "\t")}\n`,
);
for (const l of lignes) console.log(l.nom, "modèle", l.modele, "COR", l.cible);
