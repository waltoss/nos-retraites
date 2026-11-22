/**
 * Backtest des artisans et commerçants : le modèle face aux statistiques publiées.
 *
 * Deux cibles servent au réglage à la main de `hypothesesIndependants.data.json` :
 * - `part` sur la part de la génération 1955 affiliée à la fois comme salarié du privé et comme
 *   artisan ou commerçant (Drees) ;
 * - `dureeRelative` sur le coefficient de proratisation moyen de la retraite de base des
 *   indépendants de la génération 1953 (Drees).
 * Le reste (retraités, pensions et masse du RCI) n'est pas réglé : c'est la validation.
 *
 * `--part-f 0.1 --part-h 0.2 --duree 0.4` essaie d'autres valeurs sans les écrire.
 */
import reference from "../data/references/independants.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	computePensions,
	estIndependant,
	generatePopulation,
	HYPOTHESES,
	HYPOTHESES_INDEPENDANTS,
	PYRAMIDE_FRANCE,
	PYRAMIDES_PROJETEES,
	poidsDeLAnnee,
	prepareProjection,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
} from "../packages/engine/src/index.ts";

const option = (nom: string, defaut: number) => {
	const i = process.argv.indexOf(nom);
	return i < 0 ? defaut : Number(process.argv[i + 1]);
};
const independants = {
	...HYPOTHESES_INDEPENDANTS,
	part: {
		F: option("--part-f", HYPOTHESES_INDEPENDANTS.part.F),
		H: option("--part-h", HYPOTHESES_INDEPENDANTS.part.H),
	},
	dureeRelative: option("--duree", HYPOTHESES_INDEPENDANTS.dureeRelative),
};
const ANNEE = B.anneeReference;
const population = generatePopulation(
	{ ...SCENARIO_REFERENCE, hypotheses: { ...HYPOTHESES, independants } },
	B,
);
const comptes = buildComptes(population, B);
const pensions = computePensions(population, B, {}, comptes);
const preparation = prepareProjection(
	population,
	B,
	{},
	{
		debut: ANNEE,
		fin: ANNEE,
		pyramides: PYRAMIDES_PROJETEES,
		champ: CHAMP_PRIVE,
		survie: SURVIE_SELON_PENSION,
		anneeEffet: ANNEE + 2,
		comptes,
		pensionsReference: pensions,
	},
);
const poids = poidsDeLAnnee(preparation, ANNEE);

type Sexe = "F" | "H";
const SEXES: Sexe[] = ["F", "H"];
const ligne = (nom: string, modele: number, observe: number, unite = "") => {
	const ecart = observe ? (modele / observe - 1) * 100 : 0;
	console.log(
		`  ${nom.padEnd(46)} modèle ${modele.toFixed(2).padStart(10)}  observé ${observe.toFixed(2).padStart(10)} ${unite.padEnd(4)} ${ecart >= 0 ? "+" : ""}${ecart.toFixed(1)} %`,
	);
};

console.log(
	`Hypothèses : part F ${independants.part.F}, H ${independants.part.H} ; durée relative ${independants.dureeRelative} ; revenu relatif ${independants.revenuRelatif.classiques} puis ${independants.revenuRelatif.avecAutoEntrepreneurs}\n`,
);

// --- Cibles du réglage ---
console.log("Réglage");
const poly =
	reference.population.polyaffiliationEtDureeAuRegime
		.polyaffiliationGeneration1955.salariesDuPriveEtArtisansOuCommercants;
const prorata =
	reference.population.polyaffiliationEtDureeAuRegime
		.coefficientDeProratisationSsiBase.valeurs;
for (const sexe of SEXES) {
	const nom = sexe === "F" ? "femmes" : "hommes";
	// Part de la génération 1955 passée par les deux statuts, en % de toute la génération.
	let affilies = 0;
	population.forEach((i, k) => {
		const c = i.carriere;
		if (c.anneeNaissance !== 1955 || c.sexe !== sexe) return;
		if (c.annees.some(estIndependant)) affilies += poids[k] as number;
	});
	const generation = (
		sexe === "F" ? PYRAMIDE_FRANCE.femmes : PYRAMIDE_FRANCE.hommes
	)[PYRAMIDE_FRANCE.annee - 1955] as number;
	ligne(
		`Génération 1955, privé + indépendant, ${nom}`,
		(affilies / generation) * 100,
		poly[nom],
		"%",
	);
	// Proratisation moyenne de la retraite de base des indépendants, générations autour de 1953.
	let somme = 0;
	let n = 0;
	population.forEach((i, k) => {
		const c = i.carriere;
		const ssi = pensions[k]?.parRegime.ssi;
		if (Math.abs(c.anneeNaissance - 1953) > 2 || c.sexe !== sexe) return;
		if (!ssi || ssi.pensionAnnuelle <= 0) return;
		somme += (poids[k] as number) * ssi.proratisation;
		n += poids[k] as number;
	});
	ligne(
		`Générations 1951-1955, proratisation, ${nom}`,
		n ? somme / n : 0,
		prorata[nom],
	);
}

// --- Validation ---
console.log(`\nValidation, retraités en ${ANNEE} (observé fin 2025)`);
const base = reference.cibles.retraitesEtPensions.baseStockFin2025;
const rci = reference.cibles.retraitesEtPensions.rciStockFin2025;
let masse = 0;
let cotisations = 0;
for (const sexe of SEXES) {
	const nom = sexe === "F" ? "femmes" : "hommes";
	let retraites = 0;
	let pensionnes = 0;
	let pensionRci = 0;
	population.forEach((i, k) => {
		const c = i.carriere;
		const w = poids[k] as number;
		const p = pensions[k];
		if (!p || w === 0) return;
		if (p.liquidation.annee > ANNEE) {
			if (c.sexe !== sexe) return;
			const a = c.annees[ANNEE - (c.annees[0]?.annee ?? ANNEE + 1)];
			if (a && estIndependant(a) && a.salaireBrut > 0)
				cotisations +=
					w *
					(B.independants?.cotisation.complementaireTranche1 ?? 0) *
					a.salaireBrut;
			return;
		}
		if (c.sexe !== sexe) return;
		if ((p.parRegime.ssi?.pensionAnnuelle ?? 0) > 0) retraites += w;
		const r = p.parRegime.rci?.pensionAnnuelle ?? 0;
		if (r > 0) {
			pensionnes += w;
			pensionRci += w * r;
		}
	});
	masse += pensionRci;
	ligne(
		`Retraités avec un droit de base, ${nom}`,
		retraites / 1000,
		base.effectifs.droitsDirects[nom] / 1000,
		"k",
	);
	ligne(
		`Retraités du RCI, ${nom}`,
		pensionnes / 1000,
		rci.effectifs.droitsDirects[nom] / 1000,
		"k",
	);
	ligne(
		`Pension mensuelle du RCI, ${nom}`,
		pensionnes ? pensionRci / pensionnes / 12 : 0,
		rci.pensionMensuelleMoyenne.droitDirect[nom],
		"€",
	);
}
ligne(
	"Pensions de droit direct du RCI",
	masse / 1e6,
	reference.cibles.massesFinancieres.rciPrestations2025
		.dontPensionsDeDroitDirect,
	"M€",
);
console.log(
	`\nCotisations RCI des indépendants simulés (tranche 1 seule, ordre de grandeur) : ${(cotisations / 1e6).toFixed(0)} M€ ; observé, tous cotisants, 2024 : ${reference.cibles.massesFinancieres.rciCompteDeResultat2024.valeurs["2024"].cotisationsSociales} M€`,
);
console.log(
	"\nLe modèle ne simule que les indépendants qui ont aussi été salariés du privé : les autres restent dans le bloc résiduel.",
);
