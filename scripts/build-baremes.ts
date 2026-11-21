/**
 * Convertit les barèmes sourcés (data/baremes/*.json) en séries annuelles normalisées
 * pour le moteur (packages/engine/src/baremes/france.data.json).
 *
 * Choix de normalisation, tous discutables et à revoir :
 * - montants en francs convertis en euros au taux légal (1 € = 6,55957 F) ;
 * - une valeur par année civile : celle en vigueur en cours d'année (dernière date d'effet de l'année ou avant) ;
 * - une génération coupée en sous-périodes prend la règle de la sous-période la plus longue ;
 * - les âges sont arrondis au trimestre supérieur ;
 * - barème par génération : celui des pensions prenant effet à partir du 1er septembre 2026.
 */
const FRF_PAR_EUR = 6.55957;
const ANNEE_REFERENCE = 2026;
const racine = new URL("..", import.meta.url).pathname;
const lire = async (f: string) =>
	JSON.parse(await Bun.file(`${racine}data/baremes/${f}`).text());
const v = (bloc: any) => bloc?.valeurs ?? bloc;
const arrondi = (x: number, n = 6) => Number(x.toFixed(n));

type Serie = Record<number, number>;

/** Série annuelle à partir d'entrées datées : la valeur retenue est la dernière entrée dont l'année est ≤ l'année. */
function parAnnee(
	entrees: { dateEffet: string; valeur: number | null }[],
	debut: number,
	fin: number,
): Serie {
	const tri = entrees
		.filter((e) => e.valeur !== null)
		.sort((a, b) => a.dateEffet.localeCompare(b.dateEffet));
	const serie: Serie = {};
	for (let annee = debut; annee <= fin; annee++) {
		let retenue: number | null = null;
		for (const e of tri)
			if (Number(e.dateEffet.slice(0, 4)) <= annee) retenue = e.valeur;
		if (retenue !== null) serie[annee] = retenue;
	}
	return serie;
}

const cnav = await lire("cnav.json");
/** Générations 1930 à 1947 et séries d'avant 1970, pour simuler les retraités les plus âgés. */
const anciennes = await lire("cnav-generations-anciennes.json");
const aa = await lire("agirc-arrco.json");

// --- CNAV ---
const pass: Serie = {};
for (const [annee, e] of Object.entries<any>(v(cnav.pass))) {
	pass[Number(annee)] = arrondi(
		e.unite === "FRF" ? e.montant / FRF_PAR_EUR : e.montant,
		2,
	);
}
// Avant 1970 : contre-valeurs en euros publiées par le COR (anciens francs et francs déjà convertis).
for (const [annee, montant] of Object.entries<number>(
	anciennes.pass.contreValeurEurosSelonCOR,
)) {
	if (pass[Number(annee)] === undefined) pass[Number(annee)] = montant;
}
const coefficientsRevalorisation: Serie = { [ANNEE_REFERENCE]: 1 };
for (const [annee, c] of Object.entries<number>(
	v(anciennes.coefficientsRevalorisation),
)) {
	coefficientsRevalorisation[Number(annee)] = c;
}
for (const [annee, c] of Object.entries<number>(
	v(cnav.coefficientsRevalorisation),
)) {
	if (typeof c === "number") coefficientsRevalorisation[Number(annee)] = c;
}
const seuilTrimestre: Serie = {};
for (const [annee, e] of Object.entries<any>(
	v(cnav.validationTrimestre).salaireMinimumPourUnTrimestre,
)) {
	if (e?.montant)
		seuilTrimestre[Number(annee)] = arrondi(
			e.unite === "FRF" ? e.montant / FRF_PAR_EUR : e.montant,
			2,
		);
}
const heures = v(cnav.validationTrimestre).heuresSmicParTrimestre as {
	de: number;
	a: number | null;
	heures: number;
}[];
const heuresPour = (annee: number) =>
	heures.find((h) => annee >= h.de && (h.a === null || annee <= h.a))?.heures ??
	heures[0]!.heures;
const smicHoraire: Serie = {};
for (const [annee, seuil] of Object.entries(seuilTrimestre)) {
	if (Number(annee) >= heures[0]!.de)
		smicHoraire[Number(annee)] = arrondi(seuil / heuresPour(Number(annee)), 4);
}
// Avant la règle des 200 heures de SMIC, un trimestre se validait par un montant fixe.
// On l'exprime en « SMIC horaire équivalent » pour que le moteur retrouve exactement ce seuil.
const DIVISEUR_ANCIEN_FRANC = 100;
for (const [annee, e] of Object.entries<any>(
	v(anciennes.validationTrimestre).salaireMinimumPourUnTrimestre,
)) {
	const a = Number(annee);
	if (!e?.montant || smicHoraire[a] !== undefined) continue;
	const francs =
		e.unite === "anciens francs"
			? e.montant / DIVISEUR_ANCIEN_FRANC
			: e.montant;
	smicHoraire[a] = arrondi(francs / FRF_PAR_EUR / heuresPour(a), 6);
}

const trimestres = (age: { ans: number; mois: number }) =>
	age.ans * 4 + Math.ceil(age.mois / 3);
const parGeneration: Record<
	number,
	{
		ageLegal: number;
		dureeRequise: number;
		ageTauxPleinAutomatique: number;
		nbMeilleuresAnnees?: number;
		dureeProratisation?: number;
	}
> = {};
for (const [annee, periodes] of Object.entries<any[]>({
	...v(anciennes.parGeneration),
	...v(cnav.parGeneration),
})) {
	const duree = (p: any) =>
		new Date(p.neAu).getTime() - new Date(p.neDu).getTime();
	const p = [...periodes].sort((a, b) => duree(b) - duree(a))[0];
	parGeneration[Number(annee)] = {
		ageLegal: trimestres(p.ageLegal),
		dureeRequise: p.dureeAssuranceTauxPlein,
		ageTauxPleinAutomatique: trimestres(p.ageTauxPleinAutomatique),
	};
	const regle = parGeneration[Number(annee)]!;
	if (p.nombreMeilleuresAnneesSam && p.nombreMeilleuresAnneesSam !== 25)
		regle.nbMeilleuresAnnees = p.nombreMeilleuresAnneesSam;
	if (
		p.dureeReferenceProratisation &&
		p.dureeReferenceProratisation !== p.dureeAssuranceTauxPlein
	)
		regle.dureeProratisation = p.dureeReferenceProratisation;
}
const mico = v(cnav.minimumContributif)[ANNEE_REFERENCE];
const plafonds = mico.plafondTousRegimesMensuel;
const plafondMensuel = Array.isArray(plafonds)
	? plafonds[plafonds.length - 1].montant
	: plafonds;
const taux = v(cnav.tauxCotisationVieillesse)[ANNEE_REFERENCE];

// --- Agirc-Arrco ---
const prix = v(aa.prixAchatDuPoint);
const enEuros = (serie: any[]) =>
	serie.map((e) => ({
		dateEffet: e.dateEffet,
		valeur: e.valeurEnEuros ?? null,
	}));
const t = v(aa.tauxCotisation);
const pourcent = (serie: any[]) =>
	serie.map((e) => ({
		dateEffet: e.dateEffet,
		valeur: e.tauxEnPourcent === null ? null : e.tauxEnPourcent / 100,
	}));
const depuis2019 = Object.fromEntries(
	t.agircArrcoDepuis2019.tranches.map((x: any) => [
		x.tranche,
		x.tauxContractuelEnPourcent / 100,
	]),
);
const service = v(aa.valeurDeServiceDuPoint).agircArrco.serie as {
	dateEffet: string;
	valeur: number;
}[];
const valeurDeService = service
	.filter((s) => s.dateEffet <= `${ANNEE_REFERENCE}-12-31`)
	.at(-1)!.valeur;
const prixAgircArrco: Serie = {};
for (const e of prix.agircArrco.serie)
	if (e.valeur !== null) prixAgircArrco[e.annee] = e.valeur;
const anticipation = [
	1,
	...v(aa.coefficientsAnticipation).selonTrimestresManquants.map(
		(e: any) => e.coefficient,
	),
];
const contributions = v(aa.contributions);

const sortie = {
	anneeReference: ANNEE_REFERENCE,
	cnav: {
		pass,
		smicHoraire,
		seuilTrimestre,
		coefficientsRevalorisation,
		parGeneration,
		nbMeilleuresAnnees: v(cnav.salaireAnnuelMoyen)
			.nombreMeilleuresAnneesCasGeneral,
		tauxPlein: v(cnav.tauxPlein).tauxPleinPct / 100,
		decoteParTrimestre:
			v(cnav.decote).pointsDeTauxParTrimestreGenerations1953EtSuivantes / 100,
		decoteTrimestresMax: v(cnav.decote).plafondTrimestres,
		surcoteParTrimestre: v(cnav.surcote).majorationParTrimestrePct / 100,
		mdaParEnfant: v(cnav.mda).totalMaximumParEnfant,
		majorationTroisEnfants: v(cnav.majorationEnfants).tauxPct / 100,
		minimumContributif: {
			annuel: mico.simpleAnnuel,
			annuelMajore: mico.majoreAnnuel,
			trimestresCotisesPourMajoration: v(cnav.minimumContributif)
				.seuilTrimestresCotisesPourMajoration,
			plafondTousRegimesAnnuel: arrondi(plafondMensuel * 12, 2),
		},
		tauxCotisation: {
			plafonne: arrondi(
				(taux.salariePlafonneePct + taux.employeurPlafonneePct) / 100,
			),
			deplafonne: arrondi(
				(taux.salarieDeplafonneePct + taux.employeurDeplafonneePct) / 100,
			),
		},
	},
	agircArrco: {
		prixAchat: {
			agircArrco: prixAgircArrco,
			arrco: parAnnee(enEuros(prix.arrco.serie), 1999, 2018),
			unirs: parAnnee(enEuros(prix.arrcoUnirsAvant1999.serie), 1960, 1998),
			agirc: parAnnee(enEuros(prix.agirc.serie), 1960, 2018),
		},
		tauxContractuel: {
			arrcoTranche1: parAnnee(
				pourcent(t.arrcoAvant2019.tauxContractuelTranche1ouA),
				1962,
				2018,
			),
			arrcoTranche2: parAnnee(
				pourcent(
					t.arrcoAvant2019.tauxContractuelTranche2NonCadres
						.entreprisesCreeesAvant1997,
				),
				1962,
				2018,
			),
			agircTrancheB: parAnnee(
				pourcent(
					t.agircAvant2019.tauxContractuelTrancheB.entreprisesCreeesAvant1981,
				),
				1960,
				2018,
			),
			agircTrancheC: parAnnee(
				pourcent(
					t.agircAvant2019.tauxContractuelTrancheC.entreprisesCreeesAvant1981,
				),
				1960,
				2018,
			),
			tranche1: depuis2019.tranche1,
			tranche2: depuis2019.tranche2,
		},
		conversion: {
			agirc: v(aa.conversion2019).coefficientPointsAgircVersAgircArrco,
			/** Coefficient UNIRS vers Arrco de 1999, lu dans les barèmes IPP seulement. */
			unirs: 0.387417,
		},
		valeurDeServiceDuPoint: valeurDeService,
		tauxAppel: t.agircArrcoDepuis2019.pourcentageAppel / 100,
		cegTranche1: contributions.ceg.tranche1.tauxGlobal / 100,
		cegTranche2: contributions.ceg.tranche2.tauxGlobal / 100,
		cet: contributions.cet.tauxGlobal / 100,
		coefficientsAnticipation: anticipation,
		majorationTroisEnfants: 0.1,
	},
};

await Bun.write(
	`${racine}packages/engine/src/baremes/france.data.json`,
	`${JSON.stringify(sortie, null, "\t")}\n`,
);
console.log(
	`PASS ${ANNEE_REFERENCE} : ${pass[ANNEE_REFERENCE]} € | point : ${valeurDeService} € | générations ${Object.keys(parGeneration)[0]}-${Object.keys(parGeneration).at(-1)}`,
);
for (const g of [1955, 1960, 1963, 1964, 1965, 1966, 1968, 1969, 1975])
	console.log(g, JSON.stringify(parGeneration[g]));
console.log(
	"PASS 1975/1990/2001/2002:",
	pass[1975],
	pass[1990],
	pass[2001],
	pass[2002],
	"| smic 1980/2000/2013/2014/2026:",
	smicHoraire[1980],
	smicHoraire[2000],
	smicHoraire[2013],
	smicHoraire[2014],
	smicHoraire[2026],
);
console.log(
	"coef 1980/2000/2020/2025:",
	coefficientsRevalorisation[1980],
	coefficientsRevalorisation[2000],
	coefficientsRevalorisation[2020],
	coefficientsRevalorisation[2025],
);
console.log(
	"taux:",
	JSON.stringify(sortie.cnav.tauxCotisation),
	"mico:",
	JSON.stringify(sortie.cnav.minimumContributif),
);
console.log(
	"unirs 1975/1998:",
	sortie.agircArrco.prixAchat.unirs[1975],
	sortie.agircArrco.prixAchat.unirs[1998],
	"arrco 1999/2015/2018:",
	sortie.agircArrco.prixAchat.arrco[1999],
	sortie.agircArrco.prixAchat.arrco[2015],
	sortie.agircArrco.prixAchat.arrco[2018],
);
