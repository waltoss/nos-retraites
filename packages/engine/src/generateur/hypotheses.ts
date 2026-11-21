/**
 * Hypothèses du générateur de carrières.
 *
 * Ce ne sont PAS des paramètres légaux ni des statistiques publiées : ce sont les
 * paramètres libres du modèle, posés à la main pour la tranche 0 et destinés à être
 * calés sur les données publiques (Drees, INSEE) puis par le backtest 2010-2025.
 */
export interface Hypotheses {
	/** Part de femmes dans une génération. */
	partFemmes: number;
	/** Âge d'entrée dans la vie active : moyenne, écart-type, effet du rang de salaire (années par écart-type). */
	ageEntree: {
		moyenne: number;
		ecartType: number;
		effetRang: number;
		min: number;
		max: number;
	};
	/** Salaire à temps plein, en part du PASS, pour un individu médian : points (âge, part du PASS). */
	profilSalaire: ReadonlyArray<readonly [age: number, partDuPass: number]>;
	/** Dispersion du niveau permanent de salaire (écart-type du logarithme). */
	sigmaPermanent: number;
	/** Dispersion des chocs annuels de salaire (écart-type du logarithme). */
	sigmaTransitoire: number;
	/** Pente de salaire supplémentaire par année d'âge et par écart-type de rang. */
	penteRang: number;
	/** Rapport du salaire des femmes à celui des hommes, à caractéristiques égales. */
	ecartSalaireFemmes: number;
	/** Seuil de rang (en écarts-types) au-dessus duquel l'individu est cadre. */
	seuilCadre: number;
	/** Répartition du nombre d'enfants (indice = nombre d'enfants). */
	repartitionEnfants: ReadonlyArray<number>;
	agePremierEnfant: { moyenne: number; ecartType: number };
	ecartEntreEnfants: number;
	/** Probabilités annuelles de transition depuis l'emploi, pour un individu médian. */
	depuisEmploi: { chomage: number; maladie: number; inactivite: number };
	/** Sensibilité du risque de chômage au rang de salaire (multiplicateur par écart-type en moins). */
	risqueRang: number;
	depuisChomage: { emploi: number; inactivite: number };
	depuisMaladie: { emploi: number; inactivite: number };
	depuisInactivite: { emploi: number };
	/** Probabilité qu'une mère interrompe son activité l'année d'une naissance, et son retour annuel ensuite. */
	interruptionNaissance: { probabilite: number; retourAnnuel: number };
	/** Part des mères en emploi qui travaillent à temps partiel tant qu'un enfant a moins de 12 ans, et leur quotité. */
	tempsPartielMeres: { part: number; quotite: number };
	/** Après cet âge, les sorties de l'emploi sont multipliées et les retours divisés. */
	seniors: {
		age: number;
		multiplicateurSorties: number;
		diviseurRetours: number;
	};
	/** Largeur de la zone juste au-dessus du SMIC où sont étalés les salaires que le modèle placerait dessous. */
	etalementSmic: number;
	/** Heures annuelles d'un temps plein, pour le plancher au SMIC. */
	heuresAnnuelles: number;
}

export const HYPOTHESES_TRANCHE_0: Hypotheses = {
	partFemmes: 0.5,
	ageEntree: {
		moyenne: 20.5,
		ecartType: 2.2,
		effetRang: 1.6,
		min: 16,
		max: 28,
	},
	profilSalaire: [
		[16, 0.36],
		[22, 0.46],
		[30, 0.6],
		[40, 0.72],
		[50, 0.78],
		[60, 0.78],
		[70, 0.76],
	],
	sigmaPermanent: 0.42,
	sigmaTransitoire: 0.08,
	penteRang: 0.006,
	ecartSalaireFemmes: 0.86,
	seuilCadre: 0.9,
	repartitionEnfants: [0.13, 0.19, 0.39, 0.2, 0.09],
	agePremierEnfant: { moyenne: 26, ecartType: 4 },
	ecartEntreEnfants: 3,
	depuisEmploi: { chomage: 0.045, maladie: 0.008, inactivite: 0.008 },
	risqueRang: 1.6,
	depuisChomage: { emploi: 0.5, inactivite: 0.1 },
	depuisMaladie: { emploi: 0.6, inactivite: 0.1 },
	depuisInactivite: { emploi: 0.12 },
	interruptionNaissance: { probabilite: 0.3, retourAnnuel: 0.22 },
	tempsPartielMeres: { part: 0.3, quotite: 0.7 },
	seniors: { age: 55, multiplicateurSorties: 1.8, diviseurRetours: 2.5 },
	etalementSmic: 0.2,
	heuresAnnuelles: 1820,
};
