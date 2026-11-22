import data from "./independants.data.json" with { type: "json" };
import {
	type BaremeIndependants,
	type SerieAnnuelle,
	valeur,
} from "./types.ts";

/**
 * Barème des artisans et commerçants, généré par scripts/build-independants.ts à partir de
 * data/baremes/independants.json.
 *
 * Simplifications du calcul des points de retraite complémentaire :
 * - pas de points avant 1979 pour les artisans (leurs points de reconstitution de carrière ne sont
 *   pas simulés) ni avant 2004 pour les commerçants, dont le régime était facultatif ;
 * - tous les points valent le point du RCI : ceux des artisans de 1979 à 1996, un peu moins bien
 *   servis, ne sont pas distingués ;
 * - les points ne sont pas arrondis à l'entier ;
 * - après l'année de référence, valeur d'achat et valeur de service suivent les prix.
 */
const serie = (s: Record<string, number>) => s as unknown as SerieAnnuelle;
const tranche = (revenu: number, bas: number, haut: number) =>
	Math.max(0, Math.min(revenu, haut) - bas);
const { rci, artisans, commercants } = data;

function pointsAnnee(
	annee: number,
	revenu: number,
	pass: number,
	metier: "artisan" | "commercant",
): number {
	if (revenu <= 0) return 0;
	if (annee >= rci.premiereAnnee) {
		const reforme = annee >= rci.anneeReforme;
		const plafond = reforme ? pass : valeur(serie(rci.plafond), annee);
		const taux = reforme ? rci.tauxDepuisReforme : rci.tauxAvantReforme;
		return (
			(tranche(revenu, 0, plafond) * taux.tranche1 +
				tranche(revenu, plafond, rci.plafondTranche2EnPass * pass) *
					taux.tranche2) /
			valeur(serie(rci.valeurDAchat), annee)
		);
	}
	// Avant 2013, chaque métier avait son régime ; leurs points sont comptés en points du RCI.
	if (metier === "artisan")
		return annee < artisans.debut
			? 0
			: (tranche(revenu, 0, pass) * valeur(serie(artisans.tranche1), annee) +
					tranche(
						revenu,
						pass,
						valeur(serie(artisans.plafondEnPass), annee) * pass,
					) *
						valeur(serie(artisans.tranche2), annee)) /
					valeur(serie(artisans.achat), annee);
	return annee < commercants.debut
		? 0
		: (tranche(revenu, 0, commercants.plafondEnPass * pass) *
				valeur(serie(commercants.taux), annee)) /
				valeur(serie(commercants.achat), annee);
}

export const BAREME_INDEPENDANTS: BaremeIndependants = {
	pointsAnnee,
	valeurDeServiceDuPoint: rci.valeurDeServiceDuPoint,
	coefficientAbattement: (trimestresManquants) => {
		const table = rci.coefficientsAbattement;
		const n = Math.max(
			0,
			Math.min(table.length - 1, Math.round(trimestresManquants)),
		);
		return table[n] ?? 1;
	},
	seuilVersementUnique: rci.seuilVersementUnique,
	cotisation: {
		basePlafonne: data.base.tauxPlafonne,
		baseDeplafonne: data.base.tauxDeplafonne,
		complementaireTranche1: rci.tauxDepuisReforme.tranche1,
		complementaireTranche2: rci.tauxDepuisReforme.tranche2,
		plafondTranche2EnPass: rci.plafondTranche2EnPass,
	},
};
