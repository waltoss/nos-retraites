import {
	type BaremeGeneration,
	type Baremes,
	baremeGeneration,
	valeur,
} from "./baremes/types.ts";
import {
	buildCompte,
	type CompteCarriere,
	cumulJusqua,
	trimestresCotisesAvant,
} from "./compte.ts";
import {
	type ComportementDepart,
	HYPOTHESES,
} from "./generateur/hypotheses.ts";
import { computeAgircArrco } from "./regimes/agircArrco.ts";
import {
	computeCnav,
	trimestresManquants,
	trimestresMda,
} from "./regimes/cnav.ts";
import type { AgeTrimestres, Carriere, Pension } from "./types.ts";

/** Règles d'un scénario. Tout champ absent garde la valeur du droit en vigueur. */
export interface ReglesScenario {
	/** Âge légal visé, en trimestres. */
	ageLegal?: AgeTrimestres;
	/** Durée requise visée, en trimestres. */
	dureeRequise?: number;
	/**
	 * Année d'effet de la réforme. Présente, l'âge légal et la durée requise montent en charge
	 * génération après génération à partir de la première qui n'a pas atteint son âge légal
	 * cette année-là. Absente, les valeurs visées valent pour toutes les générations.
	 */
	anneeEffet?: number;
	/** Pas de la montée en charge, en trimestres par génération (1 par défaut). */
	rythme?: number;
	/** Faux : les départs anticipés pour carrière longue sont supprimés. */
	carriereLongue?: boolean;
	/** Nombre de meilleures années retenues pour le salaire annuel moyen. */
	nbMeilleuresAnnees?: number;
	/** Taux plein du régime général (0,5 = 50 %). */
	tauxPlein?: number;
	/** Points de taux perdus par trimestre manquant. */
	decoteParTrimestre?: number;
	/** Majoration de pension par trimestre de surcote. */
	surcoteParTrimestre?: number;
	/** Multiplicateur de la valeur de service du point de retraite complémentaire. */
	valeurDuPoint?: number;
	/** Multiplicateur du minimum contributif (0 le supprime). */
	minimumContributif?: number;
	/** Trimestres accordés à la mère par enfant. */
	mdaParEnfant?: number;
	/** Majoration de pension pour trois enfants, dans les deux régimes. */
	majorationTroisEnfants?: number;
	/** Points ajoutés au taux de cotisation vieillesse plafonné (0,01 = 1 point). */
	cotisationBase?: number;
	/** Taux d'appel des cotisations de retraite complémentaire (1,27 = 127 %). */
	tauxAppel?: number;
	/**
	 * Revalorisation annuelle des pensions déjà liquidées, en écart aux prix (-0,01 = un point de moins que l'inflation).
	 * N'a d'effet que dans une projection.
	 */
	revalorisationReelle?: number;
}

/** Barèmes d'un scénario : le droit en vigueur, modifié par les règles du scénario. */
export function appliquerRegles(b: Baremes, r: ReglesScenario = {}): Baremes {
	const m = b.cnav.minimumContributif;
	const k = r.minimumContributif;
	return {
		...b,
		cnav: {
			...b.cnav,
			nbMeilleuresAnnees: r.nbMeilleuresAnnees ?? b.cnav.nbMeilleuresAnnees,
			tauxPlein: r.tauxPlein ?? b.cnav.tauxPlein,
			decoteParTrimestre: r.decoteParTrimestre ?? b.cnav.decoteParTrimestre,
			surcoteParTrimestre: r.surcoteParTrimestre ?? b.cnav.surcoteParTrimestre,
			mdaParEnfant: r.mdaParEnfant ?? b.cnav.mdaParEnfant,
			majorationTroisEnfants:
				r.majorationTroisEnfants ?? b.cnav.majorationTroisEnfants,
			minimumContributif:
				m && k !== undefined
					? k === 0
						? null
						: { ...m, annuel: m.annuel * k, annuelMajore: m.annuelMajore * k }
					: m,
			tauxCotisation: {
				...b.cnav.tauxCotisation,
				plafonne: b.cnav.tauxCotisation.plafonne + (r.cotisationBase ?? 0),
			},
		},
		agircArrco: {
			...b.agircArrco,
			valeurDeServiceDuPoint:
				b.agircArrco.valeurDeServiceDuPoint * (r.valeurDuPoint ?? 1),
			majorationTroisEnfants:
				r.majorationTroisEnfants ?? b.agircArrco.majorationTroisEnfants,
			cotisation: {
				...b.agircArrco.cotisation,
				tauxAppel: r.tauxAppel ?? b.agircArrco.cotisation.tauxAppel,
			},
		},
	};
}

/** Un pas de la montée en charge : la valeur de la génération précédente avance vers la cible, sans croiser le droit en vigueur. */
function avancer(
	precedente: number,
	droit: number,
	cible: number,
	pas: number,
): number {
	return cible >= droit
		? Math.min(cible, Math.max(droit, precedente + pas))
		: Math.max(cible, Math.min(droit, precedente - pas));
}

/**
 * Première génération concernée par une réforme : celle qui atteint son âge légal
 * du droit en vigueur l'année d'effet ou après.
 */
export function premiereGenerationConcernee(
	b: Baremes,
	anneeEffet: number,
): number {
	let generation = anneeEffet - 70;
	while (
		generation + baremeGeneration(b.cnav, generation).ageLegal / 4 <
		anneeEffet
	)
		generation++;
	return generation;
}

const MONTEES = new WeakMap<
	ReglesScenario,
	Map<number, { ageLegal: number; dureeRequise: number }>
>();

/** Âge légal et durée requise d'une génération pendant la montée en charge d'une réforme datée. */
function monteeEnCharge(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario,
	anneeEffet: number,
): { ageLegal: number; dureeRequise: number } {
	let connues = MONTEES.get(regles);
	if (!connues) {
		connues = new Map();
		MONTEES.set(regles, connues);
	}
	const connue = connues.get(anneeNaissance);
	if (connue) return connue;
	const premiere = premiereGenerationConcernee(b, anneeEffet);
	const pas = regles.rythme ?? 1;
	const avant = baremeGeneration(b.cnav, premiere - 1);
	let ageLegal = avant.ageLegal;
	let dureeRequise = avant.dureeRequise;
	const droit = baremeGeneration(b.cnav, anneeNaissance);
	if (anneeNaissance < premiere) {
		ageLegal = droit.ageLegal;
		dureeRequise = droit.dureeRequise;
	}
	for (let g = premiere; g <= anneeNaissance; g++) {
		const d = baremeGeneration(b.cnav, g);
		ageLegal = avancer(
			ageLegal,
			d.ageLegal,
			regles.ageLegal ?? d.ageLegal,
			pas,
		);
		dureeRequise = avancer(
			dureeRequise,
			d.dureeRequise,
			regles.dureeRequise ?? d.dureeRequise,
			pas,
		);
	}
	const resultat = { ageLegal, dureeRequise };
	connues.set(anneeNaissance, resultat);
	return resultat;
}

export function reglesGeneration(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario = {},
): BaremeGeneration {
	const g = baremeGeneration(b.cnav, anneeNaissance);
	const modifie =
		regles.ageLegal !== undefined || regles.dureeRequise !== undefined;
	const vise =
		modifie && regles.anneeEffet !== undefined
			? monteeEnCharge(anneeNaissance, b, regles, regles.anneeEffet)
			: {
					ageLegal: regles.ageLegal ?? g.ageLegal,
					dureeRequise: regles.dureeRequise ?? g.dureeRequise,
				};
	const dureeModifiee = vise.dureeRequise !== g.dureeRequise;
	// Hypothèse : les départs pour carrière longue gardent leur avance sur l'âge légal et suivent la durée requise.
	const ecartAge = vise.ageLegal - g.ageLegal;
	const ecartDuree = vise.dureeRequise - g.dureeRequise;
	return {
		carriereLongue:
			regles.carriereLongue === false
				? undefined
				: ecartAge === 0 && ecartDuree === 0
					? g.carriereLongue
					: g.carriereLongue?.map((c) => ({
							debutAvant: c.debutAvant,
							age: c.age + ecartAge,
							dureeCotisee: c.dureeCotisee + ecartDuree,
						})),
		ageLegal: vise.ageLegal,
		dureeRequise: vise.dureeRequise,
		ageTauxPleinAutomatique: Math.max(g.ageTauxPleinAutomatique, vise.ageLegal),
		nbMeilleuresAnnees: regles.nbMeilleuresAnnees ?? g.nbMeilleuresAnnees,
		dureeProratisation: dureeModifiee
			? vise.dureeRequise
			: g.dureeProratisation,
	};
}

export interface Depart {
	age: AgeTrimestres;
	motif?: "carriereLongue" | "inaptitude";
}

/** Tirages indépendants tirés du tirage unique de l'individu. */
const tirage = (u: number, k: number) => (u * [1, 7919, 104729][k]!) % 1;

/**
 * Âge de départ. Sans comportement, l'individu part dès qu'il a le taux plein, par la durée
 * ou par l'âge, jamais avant l'âge légal sauf carrière longue. Avec un comportement et un
 * tirage propre à l'individu, il peut aussi partir pour inaptitude, accepter une décote
 * ou continuer de travailler après le taux plein.
 */
export function decideLiquidation(
	carriere: Carriere,
	compte: CompteCarriere,
	g: BaremeGeneration,
	b: Baremes,
	comportement?: ComportementDepart,
): Depart {
	// Carrière longue : départ avant l'âge légal dès que la durée cotisée est atteinte.
	const longue = b.cnav.carriereLongue;
	const debut = longue?.trimestresDebut;
	if (longue && debut !== undefined && g.carriereLongue) {
		let anticipe = g.ageLegal;
		const reputes = (age: AgeTrimestres) => {
			const annee = carriere.anneeNaissance + Math.floor(age / 4);
			return (
				cumulJusqua(compte, age).trimestresReputes +
				(annee >= longue.majorationsEnfantsDepuis
					? Math.min(
							longue.plafondsReputes.majorationsEnfants,
							trimestresMda(carriere, b.cnav, annee),
						)
					: 0)
			);
		};
		for (const borne of g.carriereLongue) {
			if (borne.age >= anticipe) continue;
			if (trimestresCotisesAvant(compte, borne.debutAvant) < debut) continue;
			for (let age = borne.age; age < anticipe; age++) {
				if (reputes(age) >= borne.dureeCotisee) {
					anticipe = age;
					break;
				}
			}
		}
		if (anticipe < g.ageLegal)
			return { age: anticipe, motif: "carriereLongue" };
	}
	const manquants = (age: AgeTrimestres) => {
		const cumul = cumulJusqua(compte, age);
		const annee = carriere.anneeNaissance + Math.floor(age / 4);
		return trimestresManquants(
			cumul.trimestresCotises +
				cumul.trimestresAssimiles +
				trimestresMda(carriere, b.cnav, annee),
			age,
			g,
		);
	};
	const enEmploi = (age: AgeTrimestres) => {
		const a = carriere.annees[Math.floor(age / 4) - compte.ageDebut];
		return a !== undefined && a.etat === "emploi" && a.salaireBrut > 0;
	};
	const u = comportement ? carriere.tirageDepart : undefined;
	const seuilDecote =
		comportement && u !== undefined && tirage(u, 1) < comportement.partDecote
			? Math.ceil(tirage(u, 2) * comportement.trimestresDecoteMax)
			: 0;
	if (
		comportement &&
		u !== undefined &&
		manquants(g.ageLegal) > 0 &&
		!enEmploi(g.ageLegal) &&
		tirage(u, 0) < comportement.partInaptitude
	)
		return { age: g.ageLegal, motif: "inaptitude" };
	let age = g.ageLegal;
	while (age < g.ageTauxPleinAutomatique && manquants(age) > seuilDecote) age++;
	if (
		comportement &&
		u !== undefined &&
		manquants(age) === 0 &&
		tirage(u, 1) > 1 - comportement.partSurcote
	) {
		// Poursuite d'activité : durée tirée d'une loi exponentielle, tant que l'emploi dure.
		const voulus = Math.ceil(
			-Math.log(1 - tirage(u, 2)) * comportement.trimestresSurcote,
		);
		const limite = Math.min(age + voulus, 70 * 4);
		while (age < limite && enEmploi(age)) age++;
	}
	return { age };
}

export interface OptionsPension {
	regles?: ReglesScenario;
	/** Âge de départ imposé ; sinon le comportement par défaut s'applique. */
	ageLiquidation?: AgeTrimestres;
	compte?: CompteCarriere;
	/** Comportement de départ ; il ne joue que pour les carrières qui portent un tirage. */
	comportement?: ComportementDepart;
}

/**
 * Calcule la pension d'une carrière, en euros de l'année de référence des barèmes.
 * Les barèmes doivent déjà porter les règles du scénario (voir appliquerRegles).
 */
export function computePension(
	carriere: Carriere,
	b: Baremes,
	options: OptionsPension = {},
): Pension {
	const compte = options.compte ?? buildCompte(carriere, b);
	let g = reglesGeneration(carriere.anneeNaissance, b, options.regles);
	const depart: Depart =
		options.ageLiquidation !== undefined
			? { age: options.ageLiquidation }
			: decideLiquidation(
					carriere,
					compte,
					g,
					b,
					options.comportement ?? HYPOTHESES.depart,
				);
	const age = depart.age;
	// L'inaptitude donne le taux plein dès l'âge légal, quelle que soit la durée.
	if (depart.motif === "inaptitude")
		g = { ...g, ageTauxPleinAutomatique: g.ageLegal };
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
	const plafond = b.cnav.minimumContributif?.plafondTousRegimesAnnuel;
	if (cnav.minimumContributifApplique && plafond) {
		const total = cnav.pensionAnnuelle + agircArrco.pensionAnnuelle;
		if (total > plafond) {
			const sansMinimum =
				cnav.salaireAnnuelMoyen *
				cnav.tauxLiquidation *
				cnav.proratisation *
				(1 + b.cnav.surcoteParTrimestre * cnav.trimestresSurcote) *
				(1 + cnav.majorationEnfants);
			cnav.pensionAnnuelle = Math.max(
				sansMinimum,
				cnav.pensionAnnuelle - (total - plafond),
			);
		}
	}

	return {
		liquidation: { age, annee: carriere.anneeNaissance + Math.floor(age / 4) },
		cnav,
		agircArrco,
		mensuelleBrute: (cnav.pensionAnnuelle + agircArrco.pensionAnnuelle) / 12,
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

export function computeCotisations(
	salaireBrut: number,
	b: Baremes,
	annee: number = b.anneeReference,
): number {
	const d = detailCotisations(salaireBrut, b, annee);
	return d.base + d.complementaire;
}
