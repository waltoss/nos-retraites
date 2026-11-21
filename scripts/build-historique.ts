/**
 * Séries historiques dont le moteur a besoin en plus des barèmes légaux :
 * - taux de cotisation moyens réellement pratiqués à l'Arrco et à l'Agirc, rapportés aux taux
 *   obligatoires (packages/engine/src/baremes/tauxMoyens.data.json) ;
 * - rapport du salaire des femmes à celui des hommes au fil du temps
 *   (packages/engine/src/generateur/ecartSalaire.data.json).
 * - salaire moyen rapporté au plafond de la Sécurité sociale
 *   (packages/engine/src/generateur/salaireMoyen.data.json).
 * Sources : data/references/complementaire-historique.json et salaires.json.
 */
import reference from "../data/references/complementaire-historique.json" with {
	type: "json",
};
import minimum from "../data/references/minimum-contributif.json" with {
	type: "json",
};
import projections from "../data/references/projections.json" with {
	type: "json",
};
import salaires from "../data/references/salaires.json" with { type: "json" };
import tempsPartiel from "../data/references/temps-partiel.json" with {
	type: "json",
};
import baremes from "../packages/engine/src/baremes/france.data.json" with {
	type: "json",
};

type Serie = Record<string, number | null>;
const propre = (s: Serie) =>
	Object.fromEntries(
		Object.entries(s).filter(([, v]) => v !== null && Number.isFinite(v)),
	) as Record<string, number>;

const t = reference.tauxMoyensEffectifs;
const aa = t.agircArrco.tranche1;
const gmp = reference.pointsGratuitsEtGMP.gmp;
const taux = {
	source: t.source,
	url: t.url,
	date: reference.tauxMoyensEffectifs.date ?? "2026-11-21",
	note: "Taux de cotisation contractuel moyen réellement pratiqué, par année, d'après l'Agirc-Arrco (classeur d'hypothèses du COR). Le moteur attribue les points à ce taux. Avant la première année connue, il applique au taux obligatoire le rapport de cette première année.",
	arrcoTranche1: propre(t.arrco.tranche1.tauxMoyen as Serie),
	arrcoTranche2: propre(t.arrco.tranche2.tauxMoyen as Serie),
	agircTrancheB: propre(t.agirc.trancheB.tauxMoyen as Serie),
	rapportInitial: {
		arrcoTranche1: Object.values(
			propre(t.arrco.tranche1.rapportMoyenSurObligatoire as Serie),
		)[0],
		arrcoTranche2: Object.values(
			propre(t.arrco.tranche2.rapportMoyenSurObligatoire as Serie),
		)[0],
		agircTrancheB: Object.values(
			propre(t.agirc.trancheB.rapportMoyenSurObligatoire as Serie),
		)[0],
	},
	/** Depuis la fusion de 2019, sur la tranche 1 seulement. */
	agircArrcoTranche1: Number(
		(
			(aa.tauxMoyen["2025"] as number) / (aa.tauxObligatoire["2025"] as number)
		).toFixed(4),
	),
	garantieMinimaleDePoints: {
		source: gmp.source,
		url: gmp.url,
		debut: Number(gmp.debut.slice(0, 4)),
		fin: Number(gmp.fin.slice(0, 4)),
		pointsAgircParAn: gmp.pointsGarantisParAn,
	},
};
await Bun.write(
	new URL(
		"../packages/engine/src/baremes/tauxMoyens.data.json",
		import.meta.url,
	),
	`${JSON.stringify(taux)}\n`,
);

const e = reference.ecartSalaireFemmesHommes;
const rapport = propre(e.rapportFemmesSurHommes as Serie);
const derniere = Math.max(...Object.keys(rapport).map(Number));
const ecart = {
	source: e.source,
	url: e.url,
	date: "2026-11-21",
	note: "Salaire net moyen à temps complet des femmes rapporté à celui des hommes, en indice de la dernière année connue. Le générateur applique cet indice à son écart de salaire.",
	derniereAnnee: derniere,
	indice: Object.fromEntries(
		Object.entries(rapport).map(([annee, r]) => [
			annee,
			Number((r / (rapport[derniere] as number)).toFixed(4)),
		]),
	),
};
await Bun.write(
	new URL(
		"../packages/engine/src/generateur/ecartSalaire.data.json",
		import.meta.url,
	),
	`${JSON.stringify(ecart)}\n`,
);

// Salaire moyen rapporté au plafond de la Sécurité sociale, en indice de l'année des salaires calés.
// Le générateur exprime les salaires en part du plafond : sans cet indice, il supposerait que
// le plafond a toujours suivi les salaires, alors qu'il a monté plus vite qu'eux depuis 1980.
const ANNEE_DES_SALAIRES = 2025;
const rmpt = salaires.remunerationMoyenneParTete;
const moyen = rmpt.rmptEurosCourants_sc0_7 as Record<string, number>;
const pass = baremes.cnav.pass as Record<string, number>;
const rapportAuPlafond = (annee: number) =>
	(moyen[annee] as number) / (pass[annee] as number);
const indiceSalaire: Record<string, number> = {};
for (const annee of Object.keys(moyen).map(Number)) {
	if (annee > ANNEE_DES_SALAIRES || pass[annee] === undefined) continue;
	indiceSalaire[annee] = Number(
		(rapportAuPlafond(annee) / rapportAuPlafond(ANNEE_DES_SALAIRES)).toFixed(4),
	);
}
await Bun.write(
	new URL(
		"../packages/engine/src/generateur/salaireMoyen.data.json",
		import.meta.url,
	),
	`${JSON.stringify({
		source: `${rmpt.source} Plafond : data/baremes/cnav.json.`,
		url: rmpt.url,
		date: rmpt.date,
		note: "Rémunération moyenne par tête rapportée au plafond de la Sécurité sociale, en indice de 2025. Après 2025 le plafond est supposé suivre les salaires : l'indice vaut 1.",
		derniereAnnee: ANNEE_DES_SALAIRES,
		indice: indiceSalaire,
	})}\n`,
);

// Minimum contributif selon l'année de départ, en euros de l'année de référence.
const mico = minimum.montants;
const prixCor = projections.hypothesesEconomiquesCOR.prix.indice as {
	anneeDebut: number;
	valeurs: number[];
};
const prixDe = (annee: number) =>
	prixCor.valeurs[annee - prixCor.anneeDebut] as number;
const reference2026 = baremes.anneeReference;
const montantsMico: Record<
	string,
	{ annuel: number; annuelMajore: number; plafondAnnuel: number | null }
> = {};
for (const annee of Object.keys(mico.simple).map(Number)) {
	if (annee >= reference2026 || annee < prixCor.anneeDebut) continue;
	const enEuros = (mensuel: number | null) =>
		mensuel === null || mensuel === undefined
			? null
			: Math.round((mensuel * 12 * prixDe(reference2026)) / prixDe(annee));
	const simple = (mico.simple as Record<string, number | null>)[annee];
	const majore = (mico.majore as Record<string, number | null>)[annee];
	if (simple == null || majore == null) continue;
	montantsMico[annee] = {
		annuel: enEuros(simple) as number,
		annuelMajore: enEuros(majore) as number,
		plafondAnnuel: enEuros(
			(mico.plafondTousRegimes as Record<string, number | null>)[annee] ?? null,
		),
	};
}
await Bun.write(
	new URL(
		"../packages/engine/src/baremes/minimumContributif.data.json",
		import.meta.url,
	),
	`${JSON.stringify({
		source: minimum.montants.source,
		url: minimum.montants.url,
		date: "2026-11-21",
		note: `Montants annuels au 1er janvier de l'année de départ, en euros de ${reference2026} (indice des prix du COR). Sans plafond tous régimes avant 2012. Avant la première année, celle-ci s'applique.`,
		parAnnee: montantsMico,
	})}\n`,
);

// Temps partiel : part des salariés à temps partiel par sexe et par année, et quotité moyenne.
const tp = tempsPartiel.partTempsPartiel.salariesFranceMetropolitaine;
const fraction = (s: Serie) =>
	Object.fromEntries(
		Object.entries(propre(s)).map(([a, v]) => [
			a,
			Number((v / 100).toFixed(4)),
		]),
	);
const heures = tempsPartiel.quotite.dureeHebdoHabituelle2025;
const quotite = (sexe: "femmes" | "hommes") =>
	Number(
		(
			(heures.tempsPartiel[sexe] as Record<string, number>)["2025"] /
			(heures.tempsComplet[sexe] as Record<string, number>)["2025"]
		).toFixed(3),
	);
await Bun.write(
	new URL(
		"../packages/engine/src/generateur/tempsPartiel.data.json",
		import.meta.url,
	),
	`${JSON.stringify({
		source: tp.source,
		url: tp.url,
		date: "2026-11-21",
		note: "Part des salariés à temps partiel par année. Quotité : durée hebdomadaire habituelle des temps partiels rapportée à celle des temps complets en 2025 (Insee, fiche Temps partiel).",
		femmes: fraction(tp.femmes as Serie),
		hommes: fraction(tp.hommes as Serie),
		quotite: { F: quotite("femmes"), H: quotite("hommes") },
	})}\n`,
);
console.log(
	"salaire moyen rapporté au plafond, indice 2025 :",
	[1950, 1970, 1990, 2010].map((a) => `${a}: ${indiceSalaire[a]}`).join(" "),
);
console.log(
	"taux moyen, Arrco T1 :",
	[1970, 1995, 2010].map((a) => `${a}: ${taux.arrcoTranche1[a]}`).join(" "),
	"| depuis 2019 :",
	taux.agircArrcoTranche1,
);
console.log(
	"indice du salaire des femmes :",
	[1960, 1980, 2000, derniere].map((a) => `${a}: ${ecart.indice[a]}`).join(" "),
);
