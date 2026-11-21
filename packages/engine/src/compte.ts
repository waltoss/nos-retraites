import { type Baremes, valeur } from "./baremes/types.ts";
import { buildCompteFonctionPublique } from "./regimes/fonctionPublique.ts";
import { type AgeTrimestres, type Carriere, moisParEtat } from "./types.ts";

/**
 * Heures annuelles du salaire forfaitaire de l'AVPF (169 heures par mois).
 * Source : barèmes IPP, « Assurance vieillesse des parents au foyer »,
 * https://www.ipp.eu/baremes-ipp/prestations-sociales/prestations_sociales.solidarite_insertion.minimum_vieillesse.avpf/table
 * (consulté le 2026-11-21). Simplification : SMIC de l'année et non du 1er juillet précédent.
 */
const HEURES_AVPF = 169 * 12;
const MOIS = 12;
const JOURS_PAR_MOIS = 30;
/** L'Agirc-Arrco attribue des points pour un arrêt de plus de 60 jours. */
const MOIS_MALADIE_POUR_POINTS = 2;

/** Droits acquis année par année, calculés une fois par carrière. */
export interface CompteCarriere {
	ageDebut: number;
	trimestresCotises: Float64Array;
	trimestresAssimiles: Float64Array;
	/** Trimestres validés par le travail dans un autre régime. */
	trimestresAutresRegimes: Uint8Array;
	/**
	 * Trimestres cotisés ou réputés cotisés pour la retraite anticipée pour carrière longue :
	 * les trimestres cotisés, la maternité, et une part plafonnée du chômage, de la maladie et de l'AVPF.
	 */
	trimestresReputes: Uint8Array;
	/** Salaire plafonné au PASS puis revalorisé vers l'année de référence. */
	salairesRevalorises: Float64Array;
	/** Carrière de fonctionnaire : primes de chaque année, revalorisées comme les traitements. */
	primesRevalorisees?: Float64Array;
	points: Float64Array;
}

export function buildCompte(carriere: Carriere, b: Baremes): CompteCarriere {
	if (carriere.fonctionPublique && b.fonctionPublique)
		return buildCompteFonctionPublique(carriere, b);
	const n = carriere.annees.length;
	const compte: CompteCarriere = {
		ageDebut:
			n > 0 ? (carriere.annees[0]?.annee ?? 0) - carriere.anneeNaissance : 0,
		trimestresCotises: new Float64Array(n),
		trimestresAssimiles: new Float64Array(n),
		trimestresAutresRegimes: new Uint8Array(n),
		trimestresReputes: new Uint8Array(n),
		salairesRevalorises: new Float64Array(n),
		points: new Float64Array(n),
	};
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
		if (a.autreRegime) autres = Math.min(4, Math.floor(mois.emploi / 3));
		else if (mois.emploi > 0 && a.salaireBrut > 0) {
			const seuil =
				b.cnav.heuresSmicParTrimestre(a.annee) *
				valeur(b.cnav.smicHoraire, a.annee);
			cotises = Math.min(4, Math.floor(a.salaireBrut / seuil));
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

/** Trimestres cotisés avant la fin de l'année civile d'un âge donné : la condition de début d'une carrière longue. */
export function trimestresCotisesAvant(
	compte: CompteCarriere,
	age: number,
): number {
	let total = 0;
	const n = Math.min(compte.points.length, age - compte.ageDebut + 1);
	for (let i = 0; i < n; i++)
		total +=
			(compte.trimestresCotises[i] as number) +
			(compte.trimestresAutresRegimes[i] as number);
	return total;
}

export interface Cumul {
	trimestresAutresRegimes: number;
	trimestresReputes: number;
	trimestresCotises: number;
	trimestresAssimiles: number;
	points: number;
}

/** Droits cumulés jusqu'à un âge donné ; l'année en cours compte au prorata des trimestres écoulés. */
export function cumulJusqua(compte: CompteCarriere, age: AgeTrimestres): Cumul {
	const anneesPleines = Math.floor(age / 4) - compte.ageDebut;
	const fraction = (age % 4) / 4;
	let cotises = 0;
	let assimiles = 0;
	let points = 0;
	let reputes = 0;
	let autres = 0;
	const n = compte.points.length;
	for (let i = 0; i < n && i < anneesPleines; i++) {
		reputes += compte.trimestresReputes[i] as number;
		autres += compte.trimestresAutresRegimes[i] as number;
		cotises += compte.trimestresCotises[i] as number;
		assimiles += compte.trimestresAssimiles[i] as number;
		points += compte.points[i] as number;
	}
	if (fraction > 0 && anneesPleines >= 0 && anneesPleines < n) {
		const max = age % 4;
		cotises += Math.min(max, compte.trimestresCotises[anneesPleines] as number);
		reputes += Math.min(max, compte.trimestresReputes[anneesPleines] as number);
		autres += Math.min(
			max,
			compte.trimestresAutresRegimes[anneesPleines] as number,
		);
		assimiles += Math.min(
			max,
			compte.trimestresAssimiles[anneesPleines] as number,
		);
		points += (compte.points[anneesPleines] as number) * fraction;
	}
	return {
		trimestresAutresRegimes: autres,
		trimestresReputes: reputes,
		trimestresCotises: cotises,
		trimestresAssimiles: assimiles,
		points,
	};
}
