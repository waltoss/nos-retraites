import {
	type BaremeFonctionPublique,
	type BaremeGeneration,
	type Baremes,
	valeur,
} from "../baremes/types.ts";
import { type CompteCarriere, type Cumul, ouvrirCompte } from "../compte.ts";
import {
	type AgeTrimestres,
	type Carriere,
	type DetailFonctionPublique,
	moisParEtat,
	type RegimeFonctionPublique,
} from "../types.ts";

/** Règles d'une génération de fonctionnaires, dans la forme commune à tous les régimes. */
export type GenerationFonctionnaire = BaremeGeneration & {
	/** Âge à partir duquel un trimestre de plus donne une surcote : l'âge légal des sédentaires. */
	ageSurcote: number;
	/** Année d'atteinte de l'âge d'ouverture du droit en vigueur, qui fixe le taux de la décote. */
	anneeOuverture: number;
	/** Trimestres de bonification propres au métier, en plus de ceux pour enfants. */
	bonifications?: number;
};

/** Ce qu'un scénario change au calcul de la pension des fonctionnaires. */
export type ReglesFonctionPublique = {
	/** Nombre de meilleures années retenues ; absent, le traitement des six derniers mois. */
	anneesTraitement?: number;
	/** Vrai : les primes s'ajoutent au traitement dans la base de la pension. */
	primesComptees?: boolean;
	/** Première année où ces règles s'appliquent : les primes n'acquièrent alors plus de points de retraite additionnelle. */
	anneeEffet?: number;
};

/**
 * Compte d'un fonctionnaire dans son régime : les trimestres cotisés sont les services,
 * les salaires portés au compte sont les traitements, les points sont ceux de la retraite additionnelle.
 * Le temps partiel compte au prorata dans les services et en entier dans la durée d'assurance ;
 * le traitement retenu est celui d'un temps plein.
 */
export function buildCompteFonctionPublique(
	carriere: Carriere,
	b: Baremes,
	regime: RegimeFonctionPublique,
): CompteCarriere {
	const fp = b.fonctionPublique as BaremeFonctionPublique;
	const n = carriere.annees.length;
	const compte = ouvrirCompte(regime, carriere);
	compte.primesRevalorisees = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		const a = carriere.annees[i];
		if (!a) continue;
		const mois = moisParEtat(a);
		if (mois.emploi === 0) continue;
		const trimestres = Math.min(4, Math.floor(mois.emploi / 3));
		if (a.affiliation !== regime) {
			compte.trimestresAutresRegimes[i] = trimestres;
		} else {
			const primes = a.primes ?? 0;
			const coefficient = valeur(b.cnav.coefficientsRevalorisation, a.annee);
			const quotite = a.quotite ?? 1;
			const traitement = a.salaireBrut - primes;
			compte.trimestresCotises[i] = trimestres * quotite;
			// Le reste de l'année compte pour la durée d'assurance, pas pour les services.
			compte.trimestresAssimiles[i] = trimestres * (1 - quotite);
			compte.salairesRevalorises[i] = (traitement / quotite) * coefficient;
			(compte.primesRevalorisees as Float64Array)[i] =
				(primes / quotite) * coefficient;
			if (a.annee >= fp.rafp.premiereAnnee)
				compte.points[i] =
					(fp.rafp.taux *
						Math.min(primes, fp.rafp.plafondAssiette * traitement)) /
					valeur(fp.rafp.valeurAcquisition, a.annee);
		}
		compte.trimestresReputes[i] = trimestres;
	}
	return compte;
}

/** Trimestres accordés à une mère fonctionnaire au titre de ses enfants, à une année de départ donnée. */
export function trimestresEnfantsFonctionPublique(
	carriere: Carriere,
	fp: BaremeFonctionPublique,
	anneeLiquidation: number,
): { bonifications: number; dureeAssurance: number } {
	if (carriere.sexe !== "F") return { bonifications: 0, dureeAssurance: 0 };
	const f = fp.droitsFamiliaux;
	let avant = 0;
	let depuis = 0;
	for (const naissance of carriere.enfants) {
		if (naissance >= anneeLiquidation) continue;
		if (naissance < f.anneeBascule) avant++;
		else depuis++;
	}
	const bonifications =
		avant * f.bonificationAvant +
		(anneeLiquidation >= f.bonificationDepuis.anneeDEffet
			? depuis * f.bonificationDepuis.trimestres
			: 0);
	return {
		bonifications,
		dureeAssurance: avant * f.bonificationAvant + depuis * f.mdaDepuis,
	};
}

/** Part du minimum garanti selon la durée de services, en trimestres. */
function partMinimumGaranti(
	services: number,
	dureeRequise: number,
	m: BaremeFonctionPublique["minimumGaranti"],
	invalidite: boolean,
): number {
	const annees = services / 4;
	if (annees >= 40) return 1;
	if (annees >= 30)
		return m.partA15Ans + 15 * m.parAnDe15A30 + (annees - 30) * m.parAnDe30A40;
	if (annees >= 15) return m.partA15Ans + (annees - 15) * m.parAnDe15A30;
	// En deçà de 15 ans : un quinzième du taux de 15 ans par année en cas d'invalidité, sinon au prorata de la durée requise.
	return invalidite
		? (m.partA15Ans * annees) / 15
		: Math.min(1, services / dureeRequise);
}

/**
 * Pension d'un fonctionnaire : traitement de référence × taux × durée de services rapportée à la
 * durée requise, avec décote ou surcote selon la durée d'assurance tous régimes, minimum garanti
 * et majoration pour enfants. La retraite additionnelle sur les primes est comptée à part.
 */
export function computeFonctionPublique(
	carriere: Carriere,
	compte: CompteCarriere,
	cumul: Cumul,
	age: AgeTrimestres,
	g: GenerationFonctionnaire,
	fp: BaremeFonctionPublique,
	regles: ReglesFonctionPublique = {},
	invalidite = false,
): DetailFonctionPublique {
	const anneeLiquidation = carriere.anneeNaissance + Math.floor(age / 4);
	const enfants = trimestresEnfantsFonctionPublique(
		carriere,
		fp,
		anneeLiquidation,
	);
	const services = cumul.trimestresCotises;
	const bonifications = enfants.bonifications + (g.bonifications ?? 0);
	const valides =
		services +
		cumul.trimestresAssimiles +
		enfants.dureeAssurance +
		(g.bonifications ?? 0) +
		cumul.trimestresAutresRegimes;
	const taux = Math.min(
		fp.tauxMaximalAvecBonifications,
		fp.tauxPlein * Math.min(1, services / g.dureeRequise) +
			(fp.tauxPlein * bonifications) / g.dureeRequise,
	);
	const d = fp.decote(g.anneeOuverture);
	const manquants = Math.min(
		d.plafond,
		Math.max(
			0,
			Math.min(g.dureeRequise - valides, g.ageTauxPleinAutomatique - age),
		),
	);
	const surcote = Math.max(
		0,
		Math.min(valides - g.dureeRequise, age - g.ageSurcote),
	);

	// Années de services avant le départ, de la plus récente à la plus ancienne.
	const anneesPleines = Math.max(
		0,
		Math.min(compte.points.length, Math.floor(age / 4) - compte.ageDebut),
	);
	const primes = compte.primesRevalorisees;
	const traitements: number[] = [];
	const remunerations: number[] = [];
	let pointsDepuisEffet = 0;
	let pointsTotal = 0;
	for (let i = anneesPleines - 1; i >= 0; i--) {
		const t = compte.salairesRevalorises[i] as number;
		if (t <= 0) continue;
		traitements.push(t);
		remunerations.push(t + (primes?.[i] ?? 0));
		const points = compte.points[i] as number;
		pointsTotal += points;
		if (
			regles.primesComptees &&
			carriere.anneeNaissance + compte.ageDebut + i >=
				(regles.anneeEffet ?? Number.NEGATIVE_INFINITY)
		)
			pointsDepuisEffet += points;
	}
	const dernierTraitement = traitements[0] ?? 0;
	const base = regles.primesComptees ? remunerations : traitements;
	let reference = base[0] ?? 0;
	if (regles.anneesTraitement !== undefined && base.length > 0) {
		const retenues = [...base]
			.sort((x, y) => y - x)
			.slice(0, Math.max(1, Math.round(regles.anneesTraitement)));
		reference = retenues.reduce((t, x) => t + x, 0) / retenues.length;
	}

	let pension =
		reference *
		taux *
		(1 - d.taux * manquants) *
		(1 + fp.surcoteParTrimestre * surcote);
	let minimumApplique = false;
	const m = fp.minimumGaranti;
	if (
		pension > 0 &&
		(manquants === 0 || anneeLiquidation < m.conditionDepuis)
	) {
		const plancher =
			m.annuel * partMinimumGaranti(services, g.dureeRequise, m, invalidite);
		if (plancher > pension) {
			pension = plancher;
			minimumApplique = true;
		}
	}
	const nbEnfants = carriere.enfants.length;
	const f = fp.droitsFamiliaux;
	let majoration =
		nbEnfants >= 3
			? f.majorationTroisEnfants +
				(nbEnfants - 3) * f.majorationParEnfantSupplementaire
			: 0;
	// La pension majorée ne dépasse pas le dernier traitement, sauf surcote.
	if (majoration > 0 && surcote === 0 && pension > 0)
		majoration = Math.max(
			0,
			Math.min(
				majoration,
				Math.max(dernierTraitement, reference) / pension - 1,
			),
		);
	pension *= 1 + majoration;

	// Retraite additionnelle : une rente au-delà du seuil de points, un capital en deçà (non compté ici).
	const points = Math.min(cumul.points, pointsTotal) - pointsDepuisEffet;
	const coefficients = fp.rafp.majorationSelonAge;
	const rafp =
		points >= fp.rafp.seuilCapital
			? points *
				fp.rafp.valeurService *
				(coefficients[
					Math.max(
						0,
						Math.min(coefficients.length - 1, Math.floor(age / 4) - 62),
					)
				] ?? 1)
			: 0;

	return {
		traitementDeReference: reference,
		services,
		bonifications,
		trimestresValides: valides,
		dureeRequise: g.dureeRequise,
		tauxLiquidation: taux,
		trimestresDecote: manquants,
		trimestresSurcote: surcote,
		majorationEnfants: majoration,
		minimumGarantiApplique: minimumApplique,
		...(invalidite ? { motif: "invalidite" as const } : {}),
		rafp,
		pensionAnnuelle: pension,
	};
}

/** Cotisations annuelles d'un fonctionnaire (agent et employeur), aux taux de l'année de référence. */
export function cotisationsFonctionPublique(
	traitement: number,
	regime: "sre" | "cnracl" | "militaire",
	fp: BaremeFonctionPublique,
): number {
	const t = fp.tauxCotisation;
	return traitement * (t.agent + t.employeur[regime]);
}
