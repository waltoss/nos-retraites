import {
	type BaremeGeneration,
	type Baremes,
	baremeGeneration,
} from "./baremes/types.ts";
import { type CompteCarriere, trimestresCotisesAvant } from "./compte.ts";
import type { AgeTrimestres, Carriere } from "./types.ts";

/** Règles d'un scénario. Tout champ absent garde la valeur du droit en vigueur. */
export type ReglesScenario = {
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
	/** Âge du taux plein automatique visé, en trimestres ; il monte en charge comme l'âge légal. */
	ageTauxPlein?: AgeTrimestres;
	/**
	 * Avance pour début précoce : l'âge légal et la durée requise d'un individu baissent de
	 * `parAnnee` trimestres pour chaque année de début de carrière avant `ageSansAvance`,
	 * dans la limite de `maximum` trimestres. Le début se juge comme pour une carrière longue.
	 */
	avanceDebut?: { maximum: number; ageSansAvance: number; parAnnee: number };
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
	/** Nombre d'années, à partir de l'année d'effet, où cet écart aux prix s'applique ; absent, sans limite. */
	revalorisationDuree?: number;
	/**
	 * Pension mensuelle brute à la liquidation, en euros de l'année de référence, en dessous de
	 * laquelle la pension suit les prix quel que soit l'écart choisi.
	 */
	revalorisationSeuil?: number;
	/** Fonctionnaires : nombre de meilleures années de traitement retenues ; absent, les six derniers mois. */
	anneesTraitement?: number;
	/** Fonctionnaires : vrai, les primes entrent dans la base de la pension. */
	primesComptees?: boolean;
	/**
	 * Fonctionnaires : part conservée de l'avance des catégories actives sur l'âge légal
	 * (1 = droit en vigueur, 0 = même âge que les sédentaires).
	 */
	avanceCategoriesActives?: number;
	/**
	 * Règles propres à une affiliation : elles remplacent, champ par champ, les règles ci-dessus
	 * pour les individus dont c'est l'affiliation principale (`sre: { ageLegal: 248 }`).
	 */
	parAffiliation?: Readonly<Record<string, ReglesScenario>>;
	/**
	 * Règles propres à des générations, bornes incluses ; une borne absente est ouverte. Elles
	 * remplacent les règles ci-dessus, dans l'ordre de la liste, avant celles de l'affiliation.
	 */
	parGeneration?: ReadonlyArray<{
		de?: number;
		a?: number;
		regles: ReglesScenario;
	}>;
};

const RESOLUES = new WeakMap<ReglesScenario, Map<string, ReglesScenario>>();

/**
 * Les règles qui valent pour un individu : celles du scénario, puis celles de sa génération,
 * puis celles de son affiliation. Le même objet est rendu pour tous ceux qui ont les mêmes.
 */
export function reglesPour(
	regles: ReglesScenario,
	anneeNaissance: number,
	affiliation: string,
): ReglesScenario {
	if (!regles.parAffiliation && !regles.parGeneration) return regles;
	const tranches: number[] = [];
	regles.parGeneration?.forEach((t, i) => {
		if (
			(t.de === undefined || anneeNaissance >= t.de) &&
			(t.a === undefined || anneeNaissance <= t.a)
		)
			tranches.push(i);
	});
	const propres = regles.parAffiliation?.[affiliation];
	const cle = `${tranches.join(",")}|${propres ? affiliation : ""}`;
	let connues = RESOLUES.get(regles);
	if (!connues) {
		connues = new Map();
		RESOLUES.set(regles, connues);
	}
	let resolues = connues.get(cle);
	if (!resolues) {
		const { parAffiliation: _a, parGeneration: _g, ...communes } = regles;
		resolues = communes;
		for (const i of tranches)
			resolues = { ...resolues, ...regles.parGeneration?.[i]?.regles };
		if (propres) resolues = { ...resolues, ...propres };
		// Un seul niveau : les règles d'une tranche ou d'une affiliation ne se subdivisent pas.
		delete resolues.parAffiliation;
		delete resolues.parGeneration;
		connues.set(cle, resolues);
	}
	return resolues;
}

const BAREMES = new WeakMap<Baremes, WeakMap<ReglesScenario, Baremes>>();

/** Barèmes d'un jeu de règles, calculés une seule fois par jeu. */
export function baremesPour(b: Baremes, regles: ReglesScenario): Baremes {
	let connus = BAREMES.get(b);
	if (!connus) {
		connus = new WeakMap();
		BAREMES.set(b, connus);
	}
	let be = connus.get(regles);
	if (!be) {
		be = appliquerRegles(b, regles);
		connus.set(regles, be);
	}
	return be;
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
		"ageTauxPlein",
		"avanceDebut",
		"carriereLongue",
		"decoteParTrimestre",
		"surcoteParTrimestre",
		"mdaParEnfant",
		"majorationTroisEnfants",
		"revalorisationReelle",
		"revalorisationDuree",
		"revalorisationSeuil",
	] as const;
	for (const cle of communes)
		if (r[cle] !== undefined) (u as Record<string, unknown>)[cle] = r[cle];
	// Les règles d'une affiliation ne valent que pour elle ; celles d'une génération se trient de même.
	if (r.parGeneration)
		u.parGeneration = r.parGeneration.map((t) => ({
			...t,
			regles: reglesUniverselles(t.regles),
		}));
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
		// Régime aligné : la cotisation de base des indépendants bouge comme celle du régime général.
		independants: b.independants && {
			...b.independants,
			cotisation: {
				...b.independants.cotisation,
				basePlafonne:
					b.independants.cotisation.basePlafonne + (r.cotisationBase ?? 0),
			},
		},
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

export type Vise = {
	ageLegal: number;
	dureeRequise: number;
	ageTauxPlein: number;
};

const MONTEES = new WeakMap<ReglesScenario, Map<number, Vise>>();

/** Âge légal, durée requise et âge du taux plein automatique d'une génération pendant la montée en charge d'une réforme datée. */
function monteeEnCharge(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario,
	anneeEffet: number,
): Vise {
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
	let ageTauxPlein = avant.ageTauxPleinAutomatique;
	const droit = baremeGeneration(b.cnav, anneeNaissance);
	if (anneeNaissance < premiere) {
		ageLegal = droit.ageLegal;
		dureeRequise = droit.dureeRequise;
		ageTauxPlein = droit.ageTauxPleinAutomatique;
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
		ageTauxPlein = avancer(
			ageTauxPlein,
			d.ageTauxPleinAutomatique,
			regles.ageTauxPlein ?? d.ageTauxPleinAutomatique,
			pas,
		);
	}
	const resultat = { ageLegal, dureeRequise, ageTauxPlein };
	connues.set(anneeNaissance, resultat);
	return resultat;
}

/** Ce qu'un scénario vise pour une génération, avant que l'âge légal ne borne l'âge du taux plein automatique. */
export function viseGeneration(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario,
): Vise {
	const g = baremeGeneration(b.cnav, anneeNaissance);
	const modifie =
		regles.ageLegal !== undefined ||
		regles.dureeRequise !== undefined ||
		regles.ageTauxPlein !== undefined;
	return modifie && regles.anneeEffet !== undefined
		? monteeEnCharge(anneeNaissance, b, regles, regles.anneeEffet)
		: {
				ageLegal: regles.ageLegal ?? g.ageLegal,
				dureeRequise: regles.dureeRequise ?? g.dureeRequise,
				ageTauxPlein: regles.ageTauxPlein ?? g.ageTauxPleinAutomatique,
			};
}

export function reglesGeneration(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario = {},
): BaremeGeneration {
	const g = baremeGeneration(b.cnav, anneeNaissance);
	const vise = viseGeneration(anneeNaissance, b, regles);
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
		ageTauxPleinAutomatique: Math.max(vise.ageTauxPlein, vise.ageLegal),
		nbMeilleuresAnnees: regles.nbMeilleuresAnnees ?? g.nbMeilleuresAnnees,
		dureeProratisation: dureeModifiee
			? vise.dureeRequise
			: g.dureeProratisation,
	};
}

const PREMIERES = new WeakMap<ReglesScenario, number>();

/**
 * Avance d'un individu pour début précoce, en trimestres. Avec une année d'effet, elle monte
 * en charge d'un pas par génération à partir de la première concernée.
 */
export function avanceDebut(
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	regles: ReglesScenario = {},
): number {
	const r = regles.avanceDebut;
	const debut = b.cnav.carriereLongue?.trimestresDebut;
	if (!r || debut === undefined || r.maximum <= 0 || r.parAnnee <= 0) return 0;
	let maximum = r.maximum;
	if (regles.anneeEffet !== undefined) {
		let premiere = PREMIERES.get(regles);
		if (premiere === undefined) {
			premiere = premiereGenerationConcernee(b, regles.anneeEffet);
			PREMIERES.set(regles, premiere);
		}
		maximum = Math.min(
			maximum,
			(carriere.anneeNaissance - premiere + 1) * (regles.rythme ?? 1),
		);
	}
	let avance = 0;
	for (
		let age = r.ageSansAvance;
		avance < maximum && trimestresCotisesAvant(compte, age) >= debut;
		age--
	)
		avance += r.parAnnee;
	return Math.max(0, Math.min(avance, maximum));
}

/** Les règles d'une génération pour un individu qui a une avance pour début précoce. */
export function avecAvance<
	G extends { ageLegal: number; dureeRequise: number },
>(g: G, avance: number): G {
	return avance > 0
		? {
				...g,
				ageLegal: g.ageLegal - avance,
				dureeRequise: g.dureeRequise - avance,
			}
		: g;
}
