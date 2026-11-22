/**
 * Tire de data/references/reserves.json ce que le moteur utilise pour faire vivre la réserve de
 * l'Agirc-Arrco (packages/engine/src/reserve.data.json).
 *
 * Choix, tous discutables :
 * - la réserve est la réserve technique de financement en valeur de marché, telle que le régime la
 *   publie (le COR donne 0,9 Md€ de plus, et 113,6 Md€ en comptant le fonds de roulement) ;
 * - ressources et charges sont les totaux du régime hors résultat financier : cotisations des
 *   entreprises et contributions des tiers d'un côté, allocations, gestion et action sociale de l'autre ;
 * - les niveaux observés fin 2025, en euros de 2025, sont repris tels quels comme point de départ
 *   de la projection (2026, euros de 2026) : un an d'inflation d'écart, négligé ;
 * - le droit en vigueur est cadré sur le COR : le rapport des charges aux ressources suit, année
 *   après année, la pension moyenne relative divisée par le rapport cotisants sur retraités que le
 *   COR publie pour l'Agirc-Arrco (figure 2.7), ce qui suppose un taux de cotisation constant ;
 * - le rendement réel est l'hypothèse que les partenaires sociaux se donnent pour leurs propres
 *   projections (accord de 2023), pas le rendement constaté.
 */
const racine = new URL("..", import.meta.url).pathname;
const reserves = JSON.parse(
	await Bun.file(`${racine}data/references/reserves.json`).text(),
);

type Chiffre = {
	valeur: number;
	unite: string;
	source: string;
	url: string;
	date: string;
};
const ANNEE = 2025;
const annee = reserves.agircArrco.serie.find(
	(a: { annee: number }) => a.annee === ANNEE,
);
if (!annee) throw new Error(`Agirc-Arrco : année ${ANNEE} absente de la série`);

/** Un montant de la source, en euros ; refuse une unité qu'il ne connaît pas. */
function enEuros(c: Chiffre): number {
	if (c.unite.startsWith("milliards d'euros"))
		return Math.round(c.valeur * 1e9);
	if (c.unite.startsWith("millions d'euros")) return Math.round(c.valeur * 1e6);
	throw new Error(`Unité inattendue : ${c.unite}`);
}
const cite = (c: Chiffre) => ({ titre: c.source, url: c.url, date: c.date });

const reserve: Chiffre =
	annee.reserves.reserveTechniqueDeFinancementValeurDeMarche;
const rendement: Chiffre = reserves.agircArrco.hypotheseDeRendementEnProjection;
if (!rendement.unite.startsWith("% par an en termes réels"))
	throw new Error(`Rendement : unité inattendue (${rendement.unite})`);
const regle = reserves.agircArrco.regleDePilotage;

const projections = JSON.parse(
	await Bun.file(`${racine}data/references/projections.json`).text(),
);
const figure =
	projections.projectionsFinancieresCOR.cnavEtAgircArrco.determinantsFigure2_7;
if (!figure)
	throw new Error("Figure 2.7 du COR introuvable dans projections.json");
const ratio = figure.rapportCotisantsRetraites["AGIRC-ARRCO"];
const relative = figure.pensionMoyenneRelative["AGIRC-ARRCO"];
if (ratio.anneeDebut !== relative.anneeDebut)
	throw new Error(
		"Figure 2.7 : les deux séries ne commencent pas la même année",
	);
/** Masse des pensions rapportée à la masse des salaires, selon le COR : seule son évolution sert. */
const chargesSurRessources: Record<number, number> = {};
ratio.valeurs.forEach((r: number, i: number) => {
	chargesSurRessources[ratio.anneeDebut + i] = Number(
		((relative.valeurs[i] as number) / r).toFixed(6),
	);
});

// --- Système entier : situation patrimoniale et taux des intérêts ---
// Choix, tous discutables :
// - point de départ : la situation patrimoniale nette du COR fin 2025, réserves de tous les régimes
//   et du FRR moins la dette retraite portée par la Cades ; le COR la publie consolidée, sans dire
//   quel régime pourrait puiser dans la réserve d'un autre ;
// - passée en euros de 2026 par l'indice des prix du COR, comme les barèmes ;
// - taux réel des réserves comme de la dette : la croissance réelle du salaire moyen par tête du
//   scénario de référence du COR (0,7 %), convention du SG-COR pour ses projections de réserves de 2017.
const ANNEE_EUROS = 2026;
const patrimoine = reserves.cor.situationPatrimonialeFin2025;
const reservesSysteme: Chiffre = patrimoine.reservesAvecFrr;
const detteSysteme: Chiffre = patrimoine.detteRetraitePorteeParLaCades;
const convention =
	reserves.cor.hypotheseDeRendementEnProjection.conventionDe2017;
if (!/salaire moyen par tête/.test(convention.citation))
	throw new Error(
		"Convention du COR : la citation ne parle plus du salaire moyen par tête",
	);
const rmpt = JSON.parse(
	await Bun.file(`${racine}data/references/salaires.json`).text(),
).remunerationMoyenneParTete;
const prix = rmpt.autresSeriesDuMemeFichier
	.indicePrixConsommationYComprisTabac_sc0_7.valeurs as Record<string, number>;
const versEuros = (prix[ANNEE_EUROS] as number) / (prix[ANNEE] as number);
const croissanceReelle = rmpt.evolutionReelle_sc0_7 as Record<string, number>;
const taux: Record<number, number> = {};
for (const [a, v] of Object.entries(croissanceReelle))
	if (Number(a) > ANNEE) taux[Number(a)] = v;
if (!taux[2070])
	throw new Error("Croissance réelle du salaire moyen : 2070 absent");

const sortie = {
	date: new Date().toISOString().slice(0, 10),
	note: "Dérivé de data/references/reserves.json par scripts/build-reserves.ts. Montants en euros.",
	agircArrco: {
		annee: ANNEE,
		initiale: enEuros(reserve),
		ressources: enEuros(annee.totalRessources),
		charges: enEuros(annee.totalCharges),
		rendement: rendement.valeur / 100,
		/** Règle de pilotage : la réserve ne doit jamais passer sous ce nombre de mois de prestations. */
		plancherMois: 6,
		horizonAnnees: 15,
		chargesSurRessources,
		sources: {
			reserve: cite(reserve),
			ressources: cite(annee.totalRessources),
			charges: cite(annee.totalCharges),
			rendement: cite(rendement),
			cadrage: {
				titre: `COR, rapport annuel de juin 2026, ${figure.titre}`,
				url: "https://www.cor-retraites.fr/sites/default/files/2026-07/RA_2026_def_1.pdf",
				date: "2026-06",
			},
			regle: {
				titre: regle.texteFondateur.source,
				url: regle.texteFondateur.url,
				date: regle.texteFondateur.date,
			},
		},
	},
	systeme: {
		annee: ANNEE,
		/** Réserves de tous les régimes et du FRR, en euros de 2026. */
		reserves: Math.round(enEuros(reservesSysteme) * versEuros),
		/** Dette retraite portée par la Cades, en euros de 2026. */
		dette: Math.round(enEuros(detteSysteme) * versEuros),
		/** Taux réel des réserves comme de la dette, par année. */
		taux,
		sources: {
			reserves: cite(reservesSysteme),
			dette: cite(detteSysteme),
			taux: {
				titre: convention.source,
				url: convention.url,
				date: convention.date,
			},
			croissance: { titre: rmpt.source, url: rmpt.url, date: rmpt.date },
		},
	},
};
if (!/six mois/.test(regle.resume) || !/quinze|15/.test(regle.resume))
	throw new Error(
		"Règle de pilotage : le résumé ne dit plus six mois sur quinze ans",
	);

await Bun.write(
	`${racine}packages/engine/src/reserve.data.json`,
	`${JSON.stringify(sortie, null, "\t")}\n`,
);
console.log(
	`Système fin ${ANNEE}, en euros de ${ANNEE_EUROS} : réserves ${(sortie.systeme.reserves / 1e9).toFixed(1)} Md€, dette ${(sortie.systeme.dette / 1e9).toFixed(1)} ; taux réel ${taux[ANNEE + 1]} en ${ANNEE + 1}, ${taux[2070]} en 2070`,
);
console.log(
	`Agirc-Arrco fin ${ANNEE} : réserve ${(sortie.agircArrco.initiale / 1e9).toFixed(1)} Md€, ressources ${(sortie.agircArrco.ressources / 1e9).toFixed(1)}, charges ${(sortie.agircArrco.charges / 1e9).toFixed(1)}, soit ${((sortie.agircArrco.initiale / sortie.agircArrco.charges) * 12).toFixed(1)} mois ; rendement réel ${sortie.agircArrco.rendement}`,
);
