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
import { HYPOTHESES_PUBLIQUES } from "./generateur/hypothesesPubliques.ts";
import { computeAgircArrco } from "./regimes/agircArrco.ts";
import {
	computeCnav,
	trimestresManquants,
	trimestresMda,
} from "./regimes/cnav.ts";
import {
	computeFonctionPublique,
	type GenerationFonctionnaire,
	trimestresEnfantsFonctionPublique,
} from "./regimes/fonctionPublique.ts";
import type {
	AgeTrimestres,
	Carriere,
	DetailAgircArrco,
	DetailCnav,
	Pension,
} from "./types.ts";

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
	/** Fonctionnaires : nombre de meilleures années de traitement retenues ; absent, les six derniers mois. */
	anneesTraitement?: number;
	/** Fonctionnaires : vrai, les primes entrent dans la base de la pension. */
	primesComptees?: boolean;
	/**
	 * Fonctionnaires : part conservée de l'avance des catégories actives sur l'âge légal
	 * (1 = droit en vigueur, 0 = même âge que les sédentaires).
	 */
	avanceCategoriesActives?: number;
}

/**
 * Les règles d'un scénario qui valent pour tous les régimes : âge, durée, décote et surcote,
 * droits familiaux, revalorisation. Les autres (meilleures années, taux plein, minimum contributif,
 * valeur du point, taux de cotisation) sont propres au régime général ou à la complémentaire du privé.
 */
export function reglesUniverselles(r: ReglesScenario): ReglesScenario {
	const u: ReglesScenario = {};
	const communes = [
		"ageLegal",
		"dureeRequise",
		"anneeEffet",
		"rythme",
		"carriereLongue",
		"decoteParTrimestre",
		"surcoteParTrimestre",
		"mdaParEnfant",
		"majorationTroisEnfants",
		"revalorisationReelle",
	] as const;
	for (const cle of communes)
		if (r[cle] !== undefined) (u as Record<string, unknown>)[cle] = r[cle];
	return u;
}

/** Barèmes d'un scénario : le droit en vigueur, modifié par les règles du scénario. */
export function appliquerRegles(b: Baremes, r: ReglesScenario = {}): Baremes {
	const m = b.cnav.minimumContributif;
	const k = r.minimumContributif;
	const fp = b.fonctionPublique;
	// Les trimestres pour enfants des fonctionnaires suivent ceux du régime général, en proportion.
	const enfants =
		b.cnav.mdaParEnfant > 0
			? (r.mdaParEnfant ?? b.cnav.mdaParEnfant) / b.cnav.mdaParEnfant
			: 1;
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
		fonctionPublique: fp && {
			...fp,
			surcoteParTrimestre: r.surcoteParTrimestre ?? fp.surcoteParTrimestre,
			// La décote des fonctionnaires bouge dans la même proportion que celle du régime général.
			decote: (annee) => {
				const d = fp.decote(annee);
				return {
					taux:
						(d.taux * (r.decoteParTrimestre ?? b.cnav.decoteParTrimestre)) /
						b.cnav.decoteParTrimestre,
					plafond: d.plafond,
				};
			},
			droitsFamiliaux: {
				...fp.droitsFamiliaux,
				bonificationAvant: Math.round(
					fp.droitsFamiliaux.bonificationAvant * enfants,
				),
				mdaDepuis: Math.round(fp.droitsFamiliaux.mdaDepuis * enfants),
				majorationTroisEnfants:
					r.majorationTroisEnfants ?? fp.droitsFamiliaux.majorationTroisEnfants,
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

/** Âge avant la fin duquel il faut avoir cotisé pour la plus tardive des portes de carrière longue. */
const AGE_DEBUT_PRECOCE = 21;

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
	/** Trimestres accordés au titre des enfants à une année de départ donnée ; absent, ceux du régime général. */
	trimestresEnfants: (annee: number) => number = (annee) =>
		trimestresMda(carriere, b.cnav, annee),
): Depart {
	// Carrière longue : départ avant l'âge légal dès que la durée cotisée est atteinte.
	const longue = b.cnav.carriereLongue;
	const debut = longue?.trimestresDebut;
	const reputesA = (age: AgeTrimestres) => {
		const annee = carriere.anneeNaissance + Math.floor(age / 4);
		return (
			cumulJusqua(compte, age).trimestresReputes +
			(longue && annee >= longue.majorationsEnfantsDepuis
				? Math.min(
						longue.plafondsReputes.majorationsEnfants,
						trimestresEnfants(annee),
					)
				: 0)
		);
	};
	if (longue && debut !== undefined && g.carriereLongue) {
		let anticipe = g.ageLegal;
		const reputes = reputesA;
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
				cumul.trimestresAutresRegimes +
				trimestresEnfants(annee),
			age,
			g,
		);
	};
	const enEmploi = (age: AgeTrimestres) => {
		const a = carriere.annees[Math.floor(age / 4) - compte.ageDebut];
		return (
			a !== undefined &&
			a.etat === "emploi" &&
			(a.salaireBrut > 0 || a.autreRegime === true)
		);
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
	// Qui a commencé tôt et réunit la durée cotisée ne prolonge pas : il part dès le taux plein, que
	// ce soit avant l'âge légal ou à cet âge. Sans cela, la même personne partirait plus tard quand
	// un scénario avance l'âge légal et rend son départ anticipé sans objet.
	const debutPrecoce =
		longue !== undefined &&
		debut !== undefined &&
		trimestresCotisesAvant(compte, AGE_DEBUT_PRECOCE) >= debut;
	if (
		comportement &&
		u !== undefined &&
		!(debutPrecoce && reputesA(age) >= g.dureeRequise) &&
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
	if (carriere.fonctionPublique && b.fonctionPublique)
		return computePensionFonctionPublique(carriere, b, options);
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
		liquidation: { age, annee: carriere.anneeNaissance + Math.floor(age / 4) },
		cnav,
		agircArrco,
		mensuelleBrute: (cnav.pensionAnnuelle + agircArrco.pensionAnnuelle) / 12,
	};
}

const PREMIERES_ACTIVES = new WeakMap<ReglesScenario, Map<string, number>>();

/**
 * Règles d'une génération de fonctionnaires dans un scénario. L'âge légal et la durée requise
 * bougent du même écart que dans le privé ; les catégories actives gardent leur avance, sauf
 * si le scénario la réduit, d'un pas par génération à partir de la première concernée.
 * Un agent de catégorie active qui n'a pas la durée de services exigée part comme un sédentaire.
 */
export function reglesGenerationFonctionPublique(
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	regles: ReglesScenario = {},
): GenerationFonctionnaire {
	const fp = b.fonctionPublique;
	const statut = carriere.fonctionPublique;
	if (!fp || !statut) throw new Error("Carrière hors de la fonction publique");
	const naissance = carriere.anneeNaissance;
	const lire = (
		categorie: "sedentaire" | "actif" | "superActif",
		g: number,
	) => {
		const table = fp.parGeneration[categorie];
		const annees = Object.keys(table).map(Number);
		const borne = Math.max(
			Math.min(...annees),
			Math.min(Math.max(...annees), g),
		);
		return table[borne] as (typeof table)[number];
	};
	if (statut.regime === "militaire") {
		// Un militaire part quand ses services le permettent : ni âge légal ni décote ne jouent ici,
		// et aucun levier d'âge ne le touche. La durée requise est celle de l'année de son départ.
		const age = (statut.ageRadiation ?? 50) * 4;
		const services = cumulJusqua(compte, age).trimestresCotises;
		const m = fp.bonificationDuCinquieme;
		return {
			ageLegal: age,
			dureeRequise: lire("sedentaire", naissance + Math.floor(age / 4) - 60)
				.dureeRequise,
			ageTauxPleinAutomatique: age,
			ageSurcote: Number.POSITIVE_INFINITY,
			anneeOuverture: naissance + Math.floor(age / 4),
			bonifications:
				Math.min(m.plafond, Math.floor(services * m.part)) +
				(statut.bonifications ?? 0),
		};
	}
	const sedentaire = lire("sedentaire", naissance);
	let categorie = statut.categorie;
	if (
		categorie !== "sedentaire" &&
		cumulJusqua(compte, lire(categorie, naissance).ageLegal).trimestresCotises <
			fp.servicesActifs[categorie]
	)
		categorie = "sedentaire";
	const droit = lire(categorie, naissance);
	const prive = baremeGeneration(b.cnav, naissance);
	const vise = reglesGeneration(naissance, b, regles);
	const ecartAge = vise.ageLegal - prive.ageLegal;
	const ecartDuree = vise.dureeRequise - prive.dureeRequise;
	// Réduction de l'avance des catégories actives, en trimestres.
	let reduction = 0;
	const conservee = regles.avanceCategoriesActives;
	if (categorie !== "sedentaire" && conservee !== undefined && conservee < 1) {
		const cible = Math.round(
			(1 - Math.max(0, conservee)) * (sedentaire.ageLegal - droit.ageLegal),
		);
		if (regles.anneeEffet === undefined) reduction = cible;
		else {
			let connues = PREMIERES_ACTIVES.get(regles);
			if (!connues) {
				connues = new Map();
				PREMIERES_ACTIVES.set(regles, connues);
			}
			let premiere = connues.get(categorie);
			if (premiere === undefined) {
				premiere = regles.anneeEffet - 70;
				while (
					premiere + lire(categorie, premiere).ageLegal / 4 <
					regles.anneeEffet
				)
					premiere++;
				connues.set(categorie, premiere);
			}
			reduction = Math.max(
				0,
				Math.min(cible, (naissance - premiere + 1) * (regles.rythme ?? 1)),
			);
		}
	}
	const ageLegal = droit.ageLegal + ecartAge + reduction;
	return {
		ageLegal,
		dureeRequise: droit.dureeRequise + ecartDuree,
		ageTauxPleinAutomatique: Math.max(
			droit.ageAnnulationDecote + reduction,
			ageLegal,
		),
		carriereLongue:
			categorie === "sedentaire" ? vise.carriereLongue : undefined,
		ageSurcote: sedentaire.ageLegal + ecartAge,
		anneeOuverture: naissance + Math.floor(droit.ageLegal / 4),
	};
}

const CNAV_VIDE: DetailCnav = {
	salaireAnnuelMoyen: 0,
	trimestresValides: 0,
	trimestresCotises: 0,
	trimestresAutresRegimes: 0,
	trimestresMda: 0,
	dureeRequise: 0,
	tauxLiquidation: 0,
	trimestresDecote: 0,
	trimestresSurcote: 0,
	proratisation: 0,
	majorationEnfants: 0,
	minimumContributifApplique: false,
	pensionAnnuelle: 0,
};
const AGIRC_ARRCO_VIDE: DetailAgircArrco = {
	points: 0,
	coefficientAnticipation: 1,
	majorationEnfants: 0,
	pensionAnnuelle: 0,
};

/** Pension d'une carrière de fonctionnaire : la seule pension de son régime de la fonction publique. */
function computePensionFonctionPublique(
	carriere: Carriere,
	b: Baremes,
	options: OptionsPension,
): Pension {
	const fp = b.fonctionPublique;
	if (!fp) throw new Error("Barème de la fonction publique absent");
	const compte = options.compte ?? buildCompte(carriere, b);
	const regles = options.regles ?? {};
	let g = reglesGenerationFonctionPublique(carriere, compte, b, regles);
	// Invalidité : la pension est versée dès la radiation, quel que soit l'âge, sans décote ni surcote.
	const invalidite = carriere.fonctionPublique?.ageInvalidite;
	const invalide = invalidite !== undefined && invalidite * 4 < g.ageLegal;
	if (invalide)
		g = {
			...g,
			ageLegal: (invalidite as number) * 4,
			ageTauxPleinAutomatique: (invalidite as number) * 4,
			ageSurcote: Number.POSITIVE_INFINITY,
		};
	const age =
		carriere.fonctionPublique?.regime === "militaire"
			? g.ageLegal
			: invalide
				? (invalidite as number) * 4
				: (options.ageLiquidation ??
					decideLiquidation(
						carriere,
						compte,
						g,
						b,
						options.comportement ??
							HYPOTHESES_PUBLIQUES.depart[
								carriere.fonctionPublique?.regime ?? "sre"
							],
						(annee) =>
							trimestresEnfantsFonctionPublique(carriere, fp, annee)
								.dureeAssurance,
					).age);
	const detail = computeFonctionPublique(
		carriere,
		compte,
		cumulJusqua(compte, age),
		age,
		g,
		fp,
		regles,
		invalide,
	);
	return {
		liquidation: { age, annee: carriere.anneeNaissance + Math.floor(age / 4) },
		cnav: { ...CNAV_VIDE, dureeRequise: g.dureeRequise },
		agircArrco: AGIRC_ARRCO_VIDE,
		fonctionPublique: detail,
		mensuelleBrute: (detail.pensionAnnuelle + detail.rafp) / 12,
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
