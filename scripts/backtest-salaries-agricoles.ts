/**
 * Backtest des salariés agricoles (MSA) : le modèle face aux statistiques publiées.
 *
 * Ils sont déjà dans la population du privé ; le modèle dit seulement lesquelles de leurs années
 * relèvent de la MSA. Deux cibles servent au réglage à la main de
 * `hypothesesSalariesAgricoles.data.json` :
 * - `part` sur les retraités de droit direct du régime, par sexe (Drees, fin 2024) ;
 * - `dureeMoyenne` sur le coefficient de proratisation de la génération 1953 (Drees) ;
 * - `recul.rapport` sur les cotisants d'aujourd'hui (prévision de la MSA).
 * Seule la pension moyenne n'est pas réglée : c'est la validation.
 *
 * `--part-f 0.1 --part-h 0.15 --duree 10 --recul 0.6` essaie d'autres valeurs sans les écrire.
 */
import reference from "../data/references/salaries-agricoles.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	computePensions,
	generatePopulation,
	HYPOTHESES,
	HYPOTHESES_SALARIES_AGRICOLES,
	moisParEtat,
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
const salariesAgricoles = {
	part: {
		F: option("--part-f", HYPOTHESES_SALARIES_AGRICOLES.part.F),
		H: option("--part-h", HYPOTHESES_SALARIES_AGRICOLES.part.H),
	},
	dureeMoyenne: option("--duree", HYPOTHESES_SALARIES_AGRICOLES.dureeMoyenne),
	recul: {
		...HYPOTHESES_SALARIES_AGRICOLES.recul,
		rapport: option("--recul", HYPOTHESES_SALARIES_AGRICOLES.recul.rapport),
	},
};
const ANNEE = B.anneeReference;
const population = generatePopulation(
	{ ...SCENARIO_REFERENCE, hypotheses: { ...HYPOTHESES, salariesAgricoles } },
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

const ligne = (nom: string, modele: number, observe: number, unite = "") => {
	const ecart = observe ? (modele / observe - 1) * 100 : 0;
	console.log(
		`  ${nom.padEnd(52)} modèle ${modele.toFixed(2).padStart(10)}  observé ${observe.toFixed(2).padStart(10)} ${unite.padEnd(4)} ${ecart >= 0 ? "+" : ""}${ecart.toFixed(1)} %`,
	);
};
console.log(
	`Hypothèses : part F ${salariesAgricoles.part.F}, H ${salariesAgricoles.part.H} ; durée moyenne ${salariesAgricoles.dureeMoyenne} ans ; recul ${salariesAgricoles.recul.rapport}\n`,
);

/** Ce que chacun doit à ses années agricoles : trimestres cotisés à la MSA et part de sa pension de base. */
const individus = population.map((i, k) => {
	const c = i.carriere;
	const p = pensions[k];
	const compte = comptes[k];
	let agricoles = 0;
	let tous = 0;
	let cotiseCetteAnnee = false;
	if (p && compte)
		c.annees.forEach((a, j) => {
			const t = compte.trimestresCotises[j] ?? 0;
			if (a.annee < p.liquidation.annee) {
				tous += t;
				if (a.affiliation === "salarieAgricole") agricoles += t;
			}
			if (
				a.annee === ANNEE &&
				a.affiliation === "salarieAgricole" &&
				a.annee < p.liquidation.annee &&
				moisParEtat(a).emploi > 0
			)
				cotiseCetteAnnee = true;
		});
	const cnav = p?.parRegime.cnav;
	return {
		sexe: c.sexe,
		generation: c.anneeNaissance,
		poids: poids[k] as number,
		retraite: p !== undefined && p.liquidation.annee <= ANNEE,
		partDansLAnnee: p?.liquidation.annee === ANNEE - 1,
		agricoles,
		cotiseCetteAnnee,
		proratisation: cnav ? agricoles / cnav.dureeRequise : 0,
		pensionMsa:
			cnav && tous > 0 ? (cnav.pensionAnnuelle * agricoles) / tous / 12 : 0,
	};
});
const somme = (
	filtre: (i: (typeof individus)[number]) => boolean,
	valeur: (i: (typeof individus)[number]) => number = () => 1,
) => individus.reduce((t, i) => (filtre(i) ? t + i.poids * valeur(i) : t), 0);

console.log("Réglage");
const drees = reference.cibles.retraitesEtPensionsSelonLaDrees.stockFin2024;
const prorata =
	reference.population.dureeAuRegime.coefficientDeProratisationGeneration1953
		.valeurs;
for (const sexe of ["F", "H"] as const) {
	const nom = sexe === "F" ? "femmes" : "hommes";
	const part =
		sexe === "F"
			? drees.partDesFemmesParmiLesDroitsDirectsPourcent
			: drees.partDesHommesPourcent;
	ligne(
		`Retraités de droit direct, ${nom}`,
		somme((i) => i.sexe === sexe && i.retraite && i.agricoles > 0) / 1000,
		(drees.droitDirectMilliers * part) / 100,
		"k",
	);
	const generation = (i: (typeof individus)[number]) =>
		i.sexe === sexe &&
		Math.abs(i.generation - 1953) <= 2 &&
		i.retraite &&
		i.agricoles > 0;
	ligne(
		`Générations 1951-1955, proratisation, ${nom}`,
		somme(generation, (i) => i.proratisation) / somme(generation),
		prorata[nom],
	);
}

ligne(
	"Cotisants (prévision de la MSA pour 2026)",
	somme((i) => i.cotiseCetteAnnee) / 1000,
	reference.population.cotisants.previsionsMsa.actifsCotisants["2026"] / 1000,
	"k",
);

console.log(`\nValidation, en ${ANNEE}`);
const pensionnes = (i: (typeof individus)[number]) =>
	i.retraite && i.agricoles > 0;
ligne(
	"Pension mensuelle moyenne de droit direct (fin 2024)",
	somme(pensionnes, (i) => i.pensionMsa) / somme(pensionnes),
	reference.cibles.retraitesEtPensionsSelonLaDrees
		.pensionMensuelleMoyenneFin2024.valeur,
	"€",
);
console.log(
	`  Départs dans l'année de salariés passés par la MSA, modèle : ${(somme((i) => i.partDansLAnnee && i.agricoles > 0) / 1000).toFixed(0)} k. Non comparable aux ${reference.cibles.retraitesEtPensionsSelonLaDrees.nouveauxRetraites.effectifsMilliers["2024"]} k nouveaux retraités du régime en 2024 : depuis la liquidation unique, la MSA ne compte que ceux dont elle est le dernier régime.`,
);
console.log(
	`  Pensions de droit direct versées, modèle : ${((somme(pensionnes, (i) => i.pensionMsa) * 12) / 1e6).toFixed(0)} M€ (observé, avec les réversions : ${reference.cibles.massesFinancieres ? "voir data/references/salaries-agricoles.json" : "non lu"})`,
);
console.log(
	"\nLa pension de la MSA est ici la part de la pension de base due aux trimestres agricoles : avec la liquidation unique, le modèle ne calcule qu'une pension pour toute la carrière de salarié.",
);
