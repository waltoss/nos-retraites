/**
 * Barème des régimes de la fonction publique (packages/engine/src/baremes/fonctionPublique.data.json),
 * tiré de data/references/fonction-publique.json, où chaque valeur porte sa source.
 *
 * Choix de normalisation, comme pour le privé (scripts/build-baremes.ts) :
 * - l'individu est né un 1er janvier : une génération coupée en sous-périodes prend la règle
 *   de la sous-période la plus longue ;
 * - les âges sont arrondis au trimestre supérieur ;
 * - une valeur par année civile : la dernière en vigueur dans l'année ;
 * - le taux de décote de 2007, absent des sources lues, est interpolé entre 2006 et 2008.
 */
import reference from "../data/references/fonction-publique.json" with {
	type: "json",
};

const PREMIERE = 1930;
const DERNIERE = 1985;
const r = reference.regles;

type Age = { ans: number; mois: number } | string;
interface Ligne {
	naissance: string;
	age?: Age;
	trimestres?: number;
}

/** Bornes d'une période de naissance écrite en clair dans la source. */
function bornes(naissance: string): [Date, Date] {
	const jour = (s: string) => new Date(`${s}T00:00:00Z`);
	const an = (a: number, fin = false) =>
		jour(fin ? `${a}-12-31` : `${a}-01-01`);
	let m = naissance.match(/^(\d{4}-\d\d-\d\d) au (\d{4}-\d\d-\d\d)$/);
	if (m) return [jour(m[1] as string), jour(m[2] as string)];
	m = naissance.match(/^avant (\d{4})-(\d\d)-(\d\d)$/);
	if (m)
		return [an(1900), new Date(jour(`${m[1]}-${m[2]}-${m[3]}`).getTime() - 1)];
	m = naissance.match(/^avant (\d{4})$/);
	if (m) return [an(1900), an(Number(m[1]) - 1, true)];
	m = naissance.match(/^(\d{4}) et avant$/);
	if (m) return [an(1900), an(Number(m[1]), true)];
	m = naissance.match(/^(\d{4}) et après$/);
	if (m) return [an(Number(m[1])), an(2200, true)];
	m = naissance.match(/^(\d{4}) à (\d{4})$/);
	if (m) return [an(Number(m[1])), an(Number(m[2]), true)];
	m = naissance.match(/^(\d{4})$/);
	if (m) return [an(Number(m[1])), an(Number(m[1]), true)];
	throw new Error(`Période de naissance illisible : « ${naissance} »`);
}

/** La ligne d'un tableau par génération qui couvre la plus grande partie de l'année de naissance. */
function ligneDe<T extends Ligne>(
	lignes: T[],
	generation: number,
): T | undefined {
	const debut = Date.UTC(generation, 0, 1);
	const fin = Date.UTC(generation, 11, 31);
	let meilleure: T | undefined;
	let duree = 0;
	for (const l of lignes) {
		const [a, b] = bornes(l.naissance);
		const commun =
			Math.min(fin, b.getTime()) - Math.max(debut, a.getTime()) + 1;
		if (commun > duree) {
			duree = commun;
			meilleure = l;
		}
	}
	return meilleure;
}

const trimestres = (age: Age): number => {
	if (typeof age === "string") {
		const m = age.match(/^(\d+) ans/);
		if (!m) throw new Error(`Âge illisible : « ${age} »`);
		return Number(m[1]) * 4;
	}
	return age.ans * 4 + Math.ceil(age.mois / 3);
};
const ageDe = (lignes: Ligne[], generation: number, defaut: number): number => {
	const l = ligneDe(lignes, generation);
	return l?.age ? trimestres(l.age) : defaut;
};

const ages = r.agesDOuvertureDesDroits;
const annulation = r.decote.ageDAnnulation.historique;
const dureesSedentaires = r.dureeRequise.sedentairesParGeneration as Ligne[];
const dureeSedentaire = (g: number) =>
	ligneDe(dureesSedentaires, g)?.trimestres ?? 172;

interface Generation {
	ageLegal: number;
	dureeRequise: number;
	ageAnnulationDecote: number;
}
const sedentaires: Record<number, Generation> = {};
const actifs: Record<number, Generation> = {};
const superActifs: Record<number, Generation> = {};

/**
 * Durée requise d'un agent de catégorie active né avant le 1er septembre 1966 (ou 1971 pour
 * les super-actifs) : celle de l'année où il atteint son âge d'ouverture, c'est-à-dire celle
 * des sédentaires qui ont 60 ans cette année-là jusqu'en 2017, puis le tableau publié.
 */
const dureeParAnneeDOuverture = (annee: number): number => {
	if (annee <= 2017) return dureeSedentaire(annee - 60);
	const l = (
		r.dureeRequise.categoriesActives
			.nesJusquAu1966_08_31_parAnneeDOuvertureDuDroit as {
			de: number;
			a: number;
			trimestres: number;
		}[]
	).find((x) => annee >= x.de && annee <= x.a);
	return l?.trimestres ?? 170;
};

for (let g = PREMIERE; g <= DERNIERE; g++) {
	sedentaires[g] = {
		ageLegal: ageDe(ages.sedentaires.enVigueur as Ligne[], g, 240),
		dureeRequise: dureeSedentaire(g),
		ageAnnulationDecote: ageDe(annulation.sedentaires as Ligne[], g, 268),
	};
	const ageActif = ageDe(ages.categoriesActives.enVigueur as Ligne[], g, 220);
	const dureeActif =
		ligneDe(
			r.dureeRequise.categoriesActives
				.nesAPartirDu1966_09_01_enVigueur as Ligne[],
			g,
		)?.trimestres ?? dureeParAnneeDOuverture(g + Math.floor(ageActif / 4));
	actifs[g] = {
		ageLegal: ageActif,
		dureeRequise: g >= 1971 ? 172 : dureeActif,
		// Nés avant 1956 : 57 ans (note du jaune).
		ageAnnulationDecote:
			g < 1956
				? 57 * 4
				: ageDe(
						annulation.actifsLimiteDAge60AvantLaLoiDe2010 as Ligne[],
						g,
						248,
					),
	};
	const ageSuper = ageDe(ages.superActifs.enVigueur as Ligne[], g, 200);
	const dureeSuper =
		ligneDe(
			r.dureeRequise.superActifs.nesAPartirDu1971_09_01_enVigueur as Ligne[],
			g,
		)?.trimestres ?? dureeParAnneeDOuverture(g + Math.floor(ageSuper / 4));
	superActifs[g] = {
		ageLegal: ageSuper,
		dureeRequise: g >= 1976 ? 172 : dureeSuper,
		ageAnnulationDecote:
			g < 1961
				? 52 * 4
				: ageDe(
						annulation.superActifsLimiteDAge55AvantLaLoiDe2010 as Ligne[],
						g,
						228,
					),
	};
}

// Décote : taux et plafond de l'année où l'agent atteint son âge d'ouverture.
const decote: Record<number, { taux: number; plafond: number }> = {};
for (const [annee, d] of Object.entries(
	r.decote.monteeEnCharge.parAnnee as Record<
		string,
		{ taux: number; plafondTrimestres: number | null } | null
	>,
)) {
	if (d)
		decote[Number(annee)] = { taux: d.taux, plafond: d.plafondTrimestres ?? 0 };
}
// 2006 : plafond non publié ; 2007 : année absente. Interpolés sur la pente publiée (un trimestre par an).
const d2008 = decote[2008] as { taux: number; plafond: number };
decote[2006] = {
	taux: decote[2006]?.taux ?? 0.00125,
	plafond: d2008.plafond - 2,
};
decote[2007] = {
	taux: ((decote[2006]?.taux ?? 0) + d2008.taux) / 2,
	plafond: d2008.plafond - 1,
};

/** Série annuelle à partir d'entrées datées : la dernière valeur dont l'année d'effet est ≤ l'année. */
function parAnnee<T>(
	entrees: T[],
	date: (e: T) => string,
	valeur: (e: T) => number,
	debut: number,
	fin: number,
): Record<number, number> {
	const tri = [...entrees].sort((a, b) => date(a).localeCompare(date(b)));
	const serie: Record<number, number> = {};
	for (let annee = debut; annee <= fin; annee++) {
		let retenue: number | undefined;
		for (const e of tri)
			if (Number(date(e).slice(0, 4)) <= annee) retenue = valeur(e);
		if (retenue !== undefined) serie[annee] = retenue;
	}
	return serie;
}

const p = r.parametres;
const valeurPoint = parAnnee(
	p.pointDIndice.serieLongueIpp.valeurs as {
		dateEffet: string;
		valeur: number;
	}[],
	(e) => e.dateEffet,
	(e) => e.valeur,
	1960,
	2026,
);
const rafp = p.rafp;
type Datee = { dateEffet: string; valeurEuros: number };
const mg = r.minimumGaranti;
const taux = p.tauxDeCotisation;

const sortie = {
	source:
		"data/references/fonction-publique.json (SRE, CNRACL, RAFP, jaune « Pensions » du PLF 2027, barèmes IPP)",
	date: reference.meta.date,
	anneeReference: 2026,
	tauxPlein: r.formule.tauxMaximal,
	tauxMaximalAvecBonifications: r.formule.tauxMaximalAvecBonifications,
	surcoteParTrimestre: r.surcote.tauxParTrimestre,
	/** Année d'atteinte de l'âge d'ouverture → taux par trimestre manquant et nombre maximal de trimestres. */
	decote,
	decoteParTrimestre: r.decote.tauxParTrimestre,
	decoteTrimestresMax: r.decote.plafondTrimestres,
	servicesActifs: {
		actif: ages.categoriesActives.conditionDeServices.annees * 4,
		superActif: 27 * 4,
	},
	parGeneration: {
		sedentaire: sedentaires,
		actif: actifs,
		superActif: superActifs,
	},
	/** Valeur annuelle du point d'indice, en euros courants. */
	valeurPoint,
	minimumGaranti: {
		/** Montant annuel pour 40 ans de services, au 1er janvier de l'année de référence ; revalorisé comme les pensions. */
		annuel: mg.base.valeurAu2026_01_01AnnuelleEUR,
		/** Barème : 57,5 % à 15 ans, + 2,5 points par an jusqu'à 30 ans, + 0,5 point par an jusqu'à 40 ans. */
		partA15Ans: 0.575,
		parAnDe15A30: 0.025,
		parAnDe30A40: 0.005,
		/** Avant cette année, le minimum garanti était servi sans condition de taux plein. */
		conditionDepuis: 2011,
	},
	droitsFamiliaux: {
		anneeBascule: 2004,
		bonificationAvant:
			r.droitsFamiliaux.enfantsNesAvant2004.bonificationTrimestres,
		mdaDepuis:
			r.droitsFamiliaux.enfantsNesDepuis2004.majorationDureeAssuranceTrimestres,
		/** Pensions prenant effet à compter du 1er septembre 2026 : un des trimestres devient une bonification. */
		bonificationDepuis: {
			anneeDEffet: 2027,
			trimestres:
				r.droitsFamiliaux.enfantsNesDepuis2004.nouveauteLfss2026
					.bonificationTrimestres,
		},
		majorationTroisEnfants:
			r.droitsFamiliaux.majorationDePensionTroisEnfants.tauxPourTroisEnfants,
		majorationParEnfantSupplementaire:
			r.droitsFamiliaux.majorationDePensionTroisEnfants.parEnfantSupplementaire,
	},
	tauxCotisation: {
		agent: taux.retenuePourPensionAgent.enVigueurAu2026_11_21 / 100,
		employeur: {
			sre: taux.contributionEmployeurEtat.enVigueurAu2026_11_21.civils / 100,
			cnracl: taux.contributionEmployeurCnracl.enVigueurAu2026_11_21 / 100,
		},
	},
	rafp: {
		premiereAnnee: 2005,
		plafondAssiette:
			rafp.assiette.plafondEnPourcentDuTraitementIndiciaireBrut / 100,
		taux: rafp.tauxDeCotisation.total / 100,
		valeurAcquisition: parAnnee(
			rafp.valeurAcquisition.valeurs as Datee[],
			(e) => e.dateEffet,
			(e) => e.valeurEuros,
			2005,
			2026,
		),
		valeurService: (rafp.valeurService.valeurs as Datee[]).at(-1)?.valeurEuros,
		seuilCapital: rafp.sortieEnCapital.seuilPoints,
		/** Coefficient de majoration selon l'âge de départ, de 62 ans (indice 0) à 75 ans. */
		majorationSelonAge: (
			rafp.coefficientDeMajorationSelonAge.valeurs as { coefficient: number }[]
		).map((x) => x.coefficient),
	},
};

await Bun.write(
	new URL(
		"../packages/engine/src/baremes/fonctionPublique.data.json",
		import.meta.url,
	),
	`${JSON.stringify(sortie, null, "\t")}\n`,
);
for (const g of [1943, 1950, 1953, 1958, 1962, 1965, 1970, 1975])
	console.log(
		g,
		"sédentaire",
		JSON.stringify(sedentaires[g]),
		"actif",
		JSON.stringify(actifs[g]),
		"super",
		JSON.stringify(superActifs[g]),
	);
console.log("décote", JSON.stringify(decote));
