/**
 * Convertit les barèmes sourcés des indépendants (data/baremes/independants.json) en séries
 * annuelles pour le moteur (packages/engine/src/baremes/independants.data.json), et en tire
 * les deux hypothèses du générateur qui se lisent dans une source (revenu relatif, part des artisans).
 *
 * Choix de normalisation, tous discutables et à revoir :
 * - une valeur par année civile : la dernière en vigueur dans l'année, comme pour le privé ;
 * - francs convertis en euros au taux légal jusqu'en 2001 ;
 * - prix d'achat des points des artisans d'avant 2013 divisé par leur coefficient de reprise dans
 *   le RCI : leurs points sont comptés directement en points RCI ;
 * - taux des artisans de 2011 et 2012 repris de 2010 (non vérifié par la source) ;
 * - taux et plafond d'après la réforme appliqués dès 2025, comme l'écrit le décret 2024-688 ;
 *   l'Urssaf les a appelés à partir de 2026 ;
 * - après l'année de référence, valeur d'achat et valeur de service du point suivent les prix
 *   (rendement constant) : aucune hypothèse officielle n'a été lue.
 */
const FRF_PAR_EUR = 6.55957;
const ANNEE_REFERENCE = 2026;
const DERNIERE_ANNEE_EN_FRANCS = 2001;
const PREMIERE_ANNEE_RCI = 2013;
const ANNEE_REFORME = 2025;
const racine = new URL("..", import.meta.url).pathname;
const lire = async (f: string) =>
	JSON.parse(await Bun.file(`${racine}${f}`).text());
const arrondi = (x: number, n = 6) => Number(x.toFixed(n));

type Entree = { annee: number; dateEffet: string; valeur: number | null };
type Serie = Record<number, number>;

/** Série annuelle : la dernière valeur dont la date d'effet tombe dans l'année ou avant. */
function parAnnee(
	entrees: Entree[],
	debut: number,
	fin: number,
	transforme: (valeur: number, annee: number) => number = (x) => x,
): Serie {
	const tri = entrees
		.filter((e) => e.valeur !== null)
		.sort((a, b) => a.dateEffet.localeCompare(b.dateEffet));
	const serie: Serie = {};
	for (let annee = debut; annee <= fin; annee++) {
		let retenue: Entree | null = null;
		for (const e of tri)
			if (Number(e.dateEffet.slice(0, 4)) <= annee) retenue = e;
		if (retenue?.valeur != null)
			serie[annee] = arrondi(
				transforme(retenue.valeur, Number(retenue.dateEffet.slice(0, 4))),
			);
	}
	return serie;
}
const pourcent = (x: number) => x / 100;

const source = await lire("data/baremes/independants.json");
const references = await lire("data/references/independants.json");
const salaires = await lire("data/references/salaires.json");
const v = (cle: string) => source[cle].valeurs;

// --- RCI depuis 2013 ---
const taux = v("rciTauxCotisation");
const tranches = (bloc: {
	tranches: { tranche: string; tauxEnPourcent: number }[];
}) => ({
	tranche1: pourcent(
		bloc.tranches.find((t) => t.tranche === "tranche1")?.tauxEnPourcent ?? 0,
	),
	tranche2: pourcent(
		bloc.tranches.find((t) => t.tranche === "tranche2")?.tauxEnPourcent ?? 0,
	),
});
const service = parAnnee(
	v("rciValeurDeServiceDuPoint").pointsRci.serie,
	PREMIERE_ANNEE_RCI,
	ANNEE_REFERENCE,
);
const liquidation = v("rciLiquidation");
/** Indice = trimestres manquants, de 0 à 20. */
const abattement: number[] = [1];
for (const c of liquidation.minoration.coefficients as {
	trimestresManquants: number;
	coefficient: number;
}[])
	abattement[c.trimestresManquants] = c.coefficient;

// --- Régimes complémentaires d'avant 2013 ---
const avant = v("complementairesAvant2013");
const coefficient = avant.repriseDansLeRci.coefficientDeConversionRco as number;
const enEuros = (x: number, annee: number) =>
	annee <= DERNIERE_ANNEE_EN_FRANCS ? x / FRF_PAR_EUR : x;
const ta = avant.artisans.tauxCotisation;
const artisans = {
	debut: 1979,
	// Points comptés en points RCI : le prix d'achat est divisé par le coefficient de reprise.
	achat: parAnnee(
		avant.artisans.valeurDAchatDuPoint.serie,
		1979,
		PREMIERE_ANNEE_RCI - 1,
		(x, annee) => enEuros(x, annee) / coefficient,
	),
	// Un seul taux jusqu'à 3 PASS (1979-1997) puis 4 PASS (1998-2007) ; deux tranches ensuite.
	tranche1: {
		...parAnnee(ta.assietteJusquA3Pass, 1979, 1997, pourcent),
		...parAnnee(ta.assietteJusquA4Pass, 1998, 2007, pourcent),
		...parAnnee(ta.sousLePass, 2008, PREMIERE_ANNEE_RCI - 1, pourcent),
	},
	tranche2: {
		...parAnnee(ta.assietteJusquA3Pass, 1979, 1997, pourcent),
		...parAnnee(ta.assietteJusquA4Pass, 1998, 2007, pourcent),
		...parAnnee(ta.entre1Et4Pass, 2008, PREMIERE_ANNEE_RCI - 1, pourcent),
	},
	plafondEnPass: Object.fromEntries(
		Array.from({ length: PREMIERE_ANNEE_RCI - 1979 }, (_, i) => [
			1979 + i,
			1979 + i <= 1997 ? 3 : 4,
		]),
	),
};
const commercants = {
	debut: 2004,
	achat: parAnnee(
		avant.commercants.valeurDAchatDuPoint.serie,
		2004,
		PREMIERE_ANNEE_RCI - 1,
	),
	taux: parAnnee(
		avant.commercants.tauxCotisation.assietteJusquA3Pass,
		2004,
		PREMIERE_ANNEE_RCI - 1,
		pourcent,
	),
	plafondEnPass: 3,
};

// --- Retraite de base ---
const base = v("baseTauxCotisation");
const dernier = (serie: Entree[]) =>
	arrondi(
		pourcent(
			[...serie]
				.sort((a, b) => a.dateEffet.localeCompare(b.dateEffet))
				.filter((e) => Number(e.dateEffet.slice(0, 4)) <= ANNEE_REFERENCE)
				.at(-1)?.valeur ?? 0,
		),
	);

// --- Hypothèses du générateur lues dans une source ---
const cotisants = references.population.cotisants.comptesUrssafFin2025.valeurs;
const partArtisans =
	cotisants.artisans.ensemble /
	(cotisants.artisans.ensemble + cotisants.commercants.ensemble);
const revenus =
	references.population.revenus.revenuDesClassiquesUrssaf.artisansCommercants
		.revenuAnnuelMoyen;
const anneeRevenu = Math.max(...Object.keys(revenus).map(Number));
const remuneration = salaires.remunerationMoyenneParTete
	.rmptEurosCourants_sc0_7 as Record<string, number>;
const revenuRelatif =
	revenus[anneeRevenu] / (remuneration[anneeRevenu] as number);
// Depuis l'auto-entreprise, une part croissante des indépendants a un revenu bien plus faible.
const ANNEE_AUTO_ENTREPRISE = 2009;
const microRevenus =
	references.population.revenus.revenuMoyenDesAutoEntrepreneurs;
const partMicro =
	references.population.cotisants.statutDesDeclarantsDeRevenu2024.valeurs
		.autoEntrepreneurs / 100;
const revenuMicro =
	(microRevenus.valeurs.artisans * cotisants.artisans.autoEntrepreneurs +
		microRevenus.valeurs.commercants *
			cotisants.commercants.autoEntrepreneurs) /
	(cotisants.artisans.autoEntrepreneurs +
		cotisants.commercants.autoEntrepreneurs);
const revenuRelatifAvecMicro =
	(partMicro * revenuMicro + (1 - partMicro) * revenus[anneeRevenu]) /
	(remuneration[anneeRevenu] as number);

const sortie = {
	source: "data/baremes/independants.json",
	date: source.rciValeurDeServiceDuPoint.dateConsultation,
	anneeReference: ANNEE_REFERENCE,
	rci: {
		premiereAnnee: PREMIERE_ANNEE_RCI,
		anneeReforme: ANNEE_REFORME,
		valeurDeServiceDuPoint: service[ANNEE_REFERENCE],
		valeurDAchat: parAnnee(
			v("rciValeurDAchatDuPoint").revenuDeReference.serie,
			PREMIERE_ANNEE_RCI,
			ANNEE_REFERENCE,
		),
		/** Limite entre les deux tranches jusqu'à la réforme ; ensuite, le plafond de la Sécurité sociale. */
		plafond: parAnnee(
			taux.plafondRci.serie,
			PREMIERE_ANNEE_RCI,
			ANNEE_REFORME - 1,
		),
		plafondTranche2EnPass: 4,
		tauxAvantReforme: tranches(taux.avantReforme),
		tauxDepuisReforme: tranches(taux.apresReforme),
		coefficientsAbattement: abattement,
		seuilVersementUnique: liquidation.versementForfaitaireUnique.seuilEnPoints,
	},
	artisans,
	commercants,
	base: {
		tauxPlafonne: dernier(base.partPlafonnee.serie),
		tauxDeplafonne: dernier(base.partDeplafonnee.serie),
	},
};
await Bun.write(
	`${racine}packages/engine/src/baremes/independants.data.json`,
	`${JSON.stringify(sortie, null, "\t")}\n`,
);

// Hypothèses du générateur : les valeurs réglées à la main sont conservées.
const chemin = `${racine}packages/engine/src/generateur/hypothesesIndependants.data.json`;
const fichier = Bun.file(chemin);
const existantes = (await fichier.exists()) ? await fichier.json() : {};
const hypotheses = {
	note: "Qui passe une partie de sa vie active comme artisan ou commerçant, combien de temps et pour quel revenu. `part` et `dureeRelative` sont réglées à la main sur scripts/backtest-independants.ts ; le reste est écrit par scripts/build-independants.ts.",
	part: existantes.part ?? { F: 0, H: 0 },
	dureeRelative: existantes.dureeRelative ?? 0,
	partArtisans: arrondi(partArtisans, 4),
	revenuRelatif: {
		avant: ANNEE_AUTO_ENTREPRISE,
		classiques: arrondi(revenuRelatif, 4),
		depuis: anneeRevenu,
		avecAutoEntrepreneurs: arrondi(revenuRelatifAvecMicro, 4),
	},
	sources: {
		revenuRelatif: {
			regle: `revenu annuel moyen des artisans et commerçants hors auto-entrepreneurs en ${anneeRevenu} (${revenus[anneeRevenu]} €), rapporté à la rémunération moyenne par tête du COR la même année (${remuneration[anneeRevenu]} €)`,
			source:
				references.population.revenus.revenuDesClassiquesUrssaf.source ??
				"data/references/independants.json",
			url: references.population.revenus.revenuDesClassiquesUrssaf.url,
			date: references.population.revenus.revenuDesClassiquesUrssaf.date,
		},
		revenuRelatifAvecAutoEntrepreneurs: {
			regle: `le même rapport en ${anneeRevenu}, auto-entrepreneurs compris : ${Math.round(partMicro * 100)} % des déclarants, au revenu moyen de ${Math.round(revenuMicro)} € (artisans et commerçants, ${microRevenus.annee}) ; entre ${ANNEE_AUTO_ENTREPRISE}, création du statut, et ${anneeRevenu}, le rapport passe de l'un à l'autre en ligne droite`,
			source: microRevenus.source,
			url: microRevenus.url,
			date: microRevenus.date,
		},
		partArtisans: {
			regle:
				"comptes de cotisants artisans / (artisans + commerçants), auto-entrepreneurs compris, fin 2025",
			source: references.population.cotisants.comptesUrssafFin2025.source,
			url: references.population.cotisants.comptesUrssafFin2025.url,
			date: references.population.cotisants.comptesUrssafFin2025.date,
		},
	},
};
await Bun.write(chemin, `${JSON.stringify(hypotheses, null, "\t")}\n`);

console.log(
	`RCI ${ANNEE_REFERENCE} : point ${sortie.rci.valeurDeServiceDuPoint} €, achat ${sortie.rci.valeurDAchat[ANNEE_REFERENCE]} €`,
);
console.log(
	`Artisans : ${(partArtisans * 100).toFixed(1)} % ; revenu relatif : ${revenuRelatif.toFixed(3)}, puis ${revenuRelatifAvecMicro.toFixed(3)} avec les auto-entrepreneurs`,
);
console.log(
	"Achat des points artisans en points RCI :",
	artisans.achat[1979],
	artisans.achat[2001],
	artisans.achat[2002],
	artisans.achat[2012],
);
