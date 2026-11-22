import type {
	Affiliation,
	Liquide,
	OptionsLiquidation,
} from "../affiliation.ts";
import {
	type BaremeGeneration,
	type Baremes,
	valeur,
} from "../baremes/types.ts";
import { type CompteCarriere, cumulJusqua, ouvrirCompte } from "../compte.ts";
import type { Depart } from "../decisions.ts";
import { HYPOTHESES } from "../generateur/hypotheses.ts";
import { computeAgircArrco } from "../regimes/agircArrco.ts";
import { computeCnav } from "../regimes/cnav.ts";
import { avanceDebut, avecAvance, reglesGeneration } from "../regles.ts";
import { type Carriere, estSalarie, moisParEtat } from "../types.ts";

const ID = "prive";

/**
 * Heures annuelles du salaire forfaitaire de l'AVPF (169 heures par mois).
 * Source : barèmes IPP, « Assurance vieillesse des parents au foyer »,
 * https://www.ipp.eu/baremes-ipp/prestations-sociales/prestations_sociales.solidarite_insertion.minimum_vieillesse.avpf/table
 * (consulté le 2026-11-21). Simplification : SMIC de l'année et non du 1er juillet précédent.
 */
const HEURES_AVPF = 169 * 12;
const MOIS = 12;
/**
 * Depuis 2014, un apprenti valide autant de trimestres que de trimestres d'apprentissage
 * (data/references/complements-2026-11.json, trimestresDesApprentis).
 */
const ANNEE_APPRENTIS_PLEINS_DROITS = 2014;
const TRIMESTRES_APPRENTI_AVANT = 1;
const JOURS_PAR_MOIS = 30;
/** L'Agirc-Arrco attribue des points pour un arrêt de plus de 60 jours. */
const MOIS_MALADIE_POUR_POINTS = 2;

/**
 * Compte d'un salarié du privé : trimestres et salaires portés au compte du régime général,
 * points de la complémentaire.
 */
function buildComptePrive(carriere: Carriere, b: Baremes): CompteCarriere {
	const n = carriere.annees.length;
	const compte = ouvrirCompte(ID, carriere);
	const aa = b.agircArrco;
	const jours = b.cnav.joursParTrimestreAssimile;
	/** Points d'une année complète au dernier salaire connu : base des points attribués hors emploi. */
	let pointsAnneePleine = 0;
	const plafonds = b.cnav.carriereLongue?.plafondsReputes;
	const reputes = { chomage: 0, maladie: 0, avpf: 0 };
	for (let i = 0; i < n; i++) {
		const a = carriere.annees[i];
		if (!a) continue;
		const mois = moisParEtat(a);
		const pass = valeur(b.cnav.pass, a.annee);
		const coefficient = valeur(b.cnav.coefficientsRevalorisation, a.annee);
		let cotises = 0;
		let salairePorte = 0;
		let points = 0;
		let autres = 0;
		if (!estSalarie(a)) autres = Math.min(4, Math.floor(mois.emploi / 3));
		else if (mois.emploi > 0 && a.salaireBrut > 0) {
			const seuil =
				b.cnav.heuresSmicParTrimestre(a.annee) *
				valeur(b.cnav.smicHoraire, a.annee);
			cotises = Math.min(4, Math.floor(a.salaireBrut / seuil));
			// Avant 2014 un apprenti cotisait sur une assiette forfaitaire, plus basse que son salaire :
			// il ne validait pas toute son année. Hypothèse : un trimestre par an, réglé sur la part des départs pour carrière longue.
			if (a.alternance && a.annee < ANNEE_APPRENTIS_PLEINS_DROITS)
				cotises = Math.min(cotises, TRIMESTRES_APPRENTI_AVANT);
			const part = mois.emploi / MOIS;
			// Le plafond s'applique au prorata des mois travaillés.
			if (cotises > 0) salairePorte = Math.min(a.salaireBrut, pass * part);
			pointsAnneePleine = aa.pointsAnnee(
				a.annee,
				a.salaireBrut / part,
				pass,
				carriere.cadre,
			);
			points = pointsAnneePleine * part;
		}
		// Périodes assimilées : des trimestres sans cotisation, et des points sur la base du dernier salaire.
		const chomage = Math.floor((mois.chomage * JOURS_PAR_MOIS) / jours.chomage);
		// L'année d'une naissance, l'arrêt de la mère est un congé maternité : un trimestre par
		// tranche de jours indemnisés, et au moins celui de l'accouchement.
		const maternite =
			jours.maternite !== undefined &&
			carriere.sexe === "F" &&
			carriere.enfants.includes(a.annee);
		const maladie = maternite
			? Math.max(
					1,
					Math.floor(
						(mois.maladie * JOURS_PAR_MOIS) / (jours.maternite as number),
					),
				)
			: Math.floor((mois.maladie * JOURS_PAR_MOIS) / jours.maladie);
		let assimiles = chomage + maladie;
		points += (pointsAnneePleine * mois.chomage) / MOIS;
		if (mois.maladie >= MOIS_MALADIE_POUR_POINTS)
			points += (pointsAnneePleine * mois.maladie) / MOIS;
		if (a.avpf) {
			// AVPF : la Caf cotise sur un salaire forfaitaire de 169 heures de SMIC par mois. Pas de points.
			const moisAuFoyer = MOIS - mois.emploi - mois.chomage - mois.maladie;
			assimiles = 4;
			salairePorte = Math.min(
				pass,
				salairePorte +
					(HEURES_AVPF * valeur(b.cnav.smicHoraire, a.annee) * moisAuFoyer) /
						MOIS,
			);
		}
		compte.trimestresCotises[i] = cotises;
		compte.trimestresAutresRegimes[i] = autres;
		// Pas plus de quatre trimestres par an, tous régimes confondus.
		cotises += autres;
		compte.trimestresAssimiles[i] = Math.min(4 - cotises, assimiles);
		if (plafonds) {
			// Chaque type de période compte dans la limite de son plafond de carrière ; la maternité compte toujours.
			let libres = 4 - cotises;
			const prendre = (
				type: "chomage" | "maladie" | "avpf",
				trimestres: number,
			) => {
				const pris = Math.max(
					0,
					Math.min(trimestres, libres, plafonds[type] - reputes[type]),
				);
				reputes[type] += pris;
				libres -= pris;
			};
			if (carriere.sexe === "F" && carriere.enfants.includes(a.annee))
				libres -= Math.min(libres, maladie);
			else prendre("maladie", maladie);
			prendre("chomage", chomage);
			if (a.avpf) prendre("avpf", 4);
			compte.trimestresReputes[i] = 4 - libres;
		} else compte.trimestresReputes[i] = cotises;
		compte.salairesRevalorises[i] = salairePorte * coefficient;
		compte.points[i] = points;
	}
	return compte;
}

/**
 * Départ d'un assuré d'un régime aligné sur le régime général : les règles de sa génération,
 * son avance pour début précoce, puis sa décision. Rend aussi les règles qui valent à cet âge.
 */
export function departAligne(
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	options: OptionsLiquidation,
): { depart: Depart; g: BaremeGeneration } {
	let g = reglesGeneration(carriere.anneeNaissance, b, options.regles);
	const avance = avanceDebut(carriere, compte, b, options.regles);
	if (avance > 0)
		g = {
			...avecAvance(g, avance),
			dureeProratisation:
				g.dureeProratisation === undefined
					? undefined
					: g.dureeProratisation - avance,
		};
	const depart: Depart =
		options.ageLiquidation !== undefined
			? {
					age: options.ageLiquidation,
					...(options.motif ? { motif: options.motif } : {}),
				}
			: options.decisions.depart(
					carriere,
					compte,
					g,
					b,
					options.comportement ?? HYPOTHESES.depart,
				);
	// L'inaptitude donne le taux plein dès l'âge légal, quelle que soit la durée.
	if (depart.motif === "inaptitude")
		g = { ...g, ageTauxPleinAutomatique: g.ageLegal };
	return { depart, g };
}

/** Départ d'un salarié du privé, pension du régime général puis de la complémentaire, qui suit sa décote. */
function liquiderPrive(
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	options: OptionsLiquidation,
): Liquide {
	const { depart, g } = departAligne(carriere, compte, b, options);
	const age = depart.age;
	const cumul = cumulJusqua(compte, age);
	const cnav = computeCnav(carriere, compte, cumul, age, g, b.cnav);
	const agircArrco = computeAgircArrco(
		carriere,
		cumul,
		cnav.trimestresDecote,
		b.agircArrco,
	);

	if (depart.motif) cnav.motif = depart.motif;

	// Écrêtement du minimum contributif quand la pension totale dépasse le plafond tous régimes.
	const passe = b.cnav.minimumContributifPasse?.(
		carriere.anneeNaissance + Math.floor(age / 4),
	);
	const plafond = passe
		? passe.plafondTousRegimesAnnuel
		: b.cnav.minimumContributif?.plafondTousRegimesAnnuel;
	if (cnav.minimumContributifApplique && plafond) {
		const sansMinimum =
			cnav.salaireAnnuelMoyen *
			cnav.tauxLiquidation *
			cnav.proratisation *
			(1 + b.cnav.surcoteParTrimestre * cnav.trimestresSurcote) *
			(1 + cnav.majorationEnfants);
		// La pension des autres régimes n'est pas calculée : on suppose qu'ils versent autant
		// par trimestre validé que le régime général et la complémentaire réunis.
		const auRegime = cnav.trimestresValides - cnav.trimestresAutresRegimes;
		const autresRegimes =
			cnav.trimestresAutresRegimes > 0
				? ((sansMinimum + agircArrco.pensionAnnuelle) *
						cnav.trimestresAutresRegimes) /
					Math.max(1, auRegime)
				: 0;
		const total =
			cnav.pensionAnnuelle + agircArrco.pensionAnnuelle + autresRegimes;
		if (total > plafond)
			cnav.pensionAnnuelle = Math.max(
				sansMinimum,
				cnav.pensionAnnuelle - (total - plafond),
			);
	}

	return {
		age,
		duree: {
			trimestresValides: cnav.trimestresValides,
			dureeRequise: cnav.dureeRequise,
			trimestresDecote: cnav.trimestresDecote,
			trimestresSurcote: cnav.trimestresSurcote,
			minimumApplique: cnav.minimumContributifApplique,
			...(depart.motif ? { motif: depart.motif } : {}),
		},
		parRegime: { cnav, agircArrco },
		annuelle: cnav.pensionAnnuelle + agircArrco.pensionAnnuelle,
	};
}

/**
 * Cotisations vieillesse annuelles (salarié + employeur), régime de base et complémentaire,
 * aux taux de l'année de référence et au plafond de l'année du salaire.
 */
export function detailCotisations(
	salaireBrut: number,
	b: Baremes,
	annee: number = b.anneeReference,
): { base: number; complementaire: number } {
	const pass = valeur(b.cnav.pass, annee);
	const c = b.agircArrco.cotisation;
	const tranche1 = Math.min(salaireBrut, pass);
	const tranche2 = Math.max(
		0,
		Math.min(salaireBrut, c.plafondTranche2EnPass * pass) - pass,
	);
	return {
		base:
			tranche1 * b.cnav.tauxCotisation.plafonne +
			salaireBrut * b.cnav.tauxCotisation.deplafonne,
		complementaire:
			tranche1 * (c.tauxTranche1 * c.tauxAppel + c.cegTranche1) +
			tranche2 * (c.tauxTranche2 * c.tauxAppel + c.cegTranche2) +
			(tranche2 > 0 ? (tranche1 + tranche2) * c.cet : 0),
	};
}

/**
 * Salarié du privé : régime général (Cnav) et complémentaire Agirc-Arrco, qui se calculent
 * ensemble. Les régimes alignés sur le régime général viendront ici, avec leur propre complémentaire.
 */
export const PRIVE: Affiliation = {
	id: ID,
	regimes: ["cnav", "agircArrco"],
	buildCompte: buildComptePrive,
	liquider: liquiderPrive,
	cotiser: (annee, b, anneeDuPlafond) =>
		detailCotisations(annee.salaireBrut, b, anneeDuPlafond),
};
