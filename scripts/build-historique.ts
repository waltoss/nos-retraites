/**
 * Séries historiques dont le moteur a besoin en plus des barèmes légaux :
 * - taux de cotisation moyens réellement pratiqués à l'Arrco et à l'Agirc, rapportés aux taux
 *   obligatoires (packages/engine/src/baremes/tauxMoyens.data.json) ;
 * - rapport du salaire des femmes à celui des hommes au fil du temps
 *   (packages/engine/src/generateur/ecartSalaire.data.json).
 * Source des deux : data/references/complementaire-historique.json.
 */
import reference from "../data/references/complementaire-historique.json" with {
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
