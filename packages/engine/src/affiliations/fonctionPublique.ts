import type {
	Affiliation,
	Liquide,
	OptionsLiquidation,
} from "../affiliation.ts";
import { type Baremes, baremeGeneration } from "../baremes/types.ts";
import { type CompteCarriere, cumulJusqua } from "../compte.ts";
import { HYPOTHESES_PUBLIQUES } from "../generateur/hypothesesPubliques.ts";
import {
	buildCompteFonctionPublique,
	computeFonctionPublique,
	cotisationsFonctionPublique,
	type GenerationFonctionnaire,
	trimestresEnfantsFonctionPublique,
} from "../regimes/fonctionPublique.ts";
import {
	avanceDebut,
	avecAvance,
	type ReglesScenario,
	reglesGeneration,
	viseGeneration,
} from "../regles.ts";
import type { Carriere, RegimeFonctionPublique } from "../types.ts";

const BORNES = new WeakMap<object, { min: number; max: number }>();
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
		// Les bornes d'une table ne se cherchent qu'une fois : cette lecture revient à chaque départ.
		let bornes = BORNES.get(table);
		if (!bornes) {
			const annees = Object.keys(table).map(Number);
			bornes = { min: Math.min(...annees), max: Math.max(...annees) };
			BORNES.set(table, bornes);
		}
		const borne = Math.max(bornes.min, Math.min(bornes.max, g));
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
	// L'âge d'annulation de la décote bouge du même écart que celui du privé.
	const ecartTauxPlein =
		viseGeneration(naissance, b, regles).ageTauxPlein -
		prive.ageTauxPleinAutomatique;
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
	// L'avance pour début précoce vaut pour les sédentaires, comme la carrière longue.
	const avance =
		categorie === "sedentaire" ? avanceDebut(carriere, compte, b, regles) : 0;
	const ageLegal = droit.ageLegal + ecartAge + reduction;
	return avecAvance(
		{
			ageLegal,
			dureeRequise: droit.dureeRequise + ecartDuree,
			ageTauxPleinAutomatique: Math.max(
				droit.ageAnnulationDecote + ecartTauxPlein + reduction,
				ageLegal,
			),
			carriereLongue:
				categorie === "sedentaire" ? vise.carriereLongue : undefined,
			ageSurcote: sedentaire.ageLegal + ecartAge - avance,
			anneeOuverture: naissance + Math.floor(droit.ageLegal / 4),
		},
		avance,
	);
}

/** Départ et pension d'un fonctionnaire dans son régime, retraite additionnelle sur les primes comprise. */
function liquider(
	regime: RegimeFonctionPublique,
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	options: OptionsLiquidation,
): Liquide {
	const fp = b.fonctionPublique;
	if (!fp) throw new Error("Barème de la fonction publique absent");
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
		regime === "militaire"
			? g.ageLegal
			: invalide
				? (invalidite as number) * 4
				: (options.ageLiquidation ??
					options.decisions.depart(
						carriere,
						compte,
						g,
						b,
						options.comportement ?? HYPOTHESES_PUBLIQUES.depart[regime],
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
		age,
		duree: {
			trimestresValides: detail.trimestresValides,
			dureeRequise: detail.dureeRequise,
			trimestresDecote: detail.trimestresDecote,
			trimestresSurcote: detail.trimestresSurcote,
			minimumApplique: detail.minimumGarantiApplique,
			...(detail.motif ? { motif: detail.motif } : {}),
		},
		parRegime: { [regime]: detail },
		annuelle: detail.pensionAnnuelle + detail.rafp,
	};
}

/**
 * Fonctionnaire d'un des trois régimes de la fonction publique : une seule pension, qui tient lieu
 * de base et de complémentaire. Le statut de l'agent (catégorie, invalidité, services militaires)
 * est lu sur sa carrière.
 */
export function affiliationFonctionPublique(
	regime: RegimeFonctionPublique,
): Affiliation {
	return {
		id: regime,
		regimes: [regime],
		buildCompte: (carriere, b) =>
			buildCompteFonctionPublique(carriere, b, regime),
		liquider: (carriere, compte, b, options) =>
			liquider(regime, carriere, compte, b, options),
		cotiser: (annee, b) => {
			if (!b.fonctionPublique)
				throw new Error("Barème de la fonction publique absent");
			return {
				base: cotisationsFonctionPublique(
					annee.salaireBrut - (annee.primes ?? 0),
					regime,
					b.fonctionPublique,
				),
				complementaire: 0,
			};
		},
	};
}
