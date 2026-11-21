import {
	type Facteurs,
	HYPOTHESES_TRANCHE_0,
	type ReglesScenario,
} from "@nos-retraites/engine";
import type { IconName } from "./components/Icons";
import { ageEnClair } from "./format";

export type LevierId =
	| "ageLegal"
	| "dureeRequise"
	| "meilleuresAnnees"
	| "tauxPlein"
	| "valeurPoint"
	| "minimum"
	| "trimestresEnfant"
	| "majorationEnfants"
	| "cotisationBase"
	| "tauxAppel"
	| "chomage"
	| "seniors"
	| "interruptions"
	| "tempsPartiel"
	| "salaireFemmes";

/** Les quatre termes de l'équation qu'un levier peut déplacer. */
export type Terme = "cotisants" | "cotisation" | "retraites" | "pension";

export const TERMES: Record<
	Terme,
	{ label: string; icone: IconName; cote: "ressources" | "depenses" }
> = {
	cotisants: {
		label: "Nombre de cotisants",
		icone: "population",
		cote: "ressources",
	},
	cotisation: {
		label: "Cotisation moyenne",
		icone: "cotisant",
		cote: "ressources",
	},
	retraites: {
		label: "Nombre de retraités",
		icone: "retraite",
		cote: "depenses",
	},
	pension: { label: "Pension moyenne", icone: "pension", cote: "depenses" },
};

export type GroupeId = "age" | "calcul" | "famille" | "financement" | "emploi";

export const GROUPES: {
	id: GroupeId;
	label: string;
	icone: IconName;
	note?: string;
}[] = [
	{ id: "age", label: "Âge et durée", icone: "age" },
	{ id: "calcul", label: "Calcul de la pension", icone: "pension" },
	{ id: "famille", label: "Droits liés aux enfants", icone: "famille" },
	{ id: "financement", label: "Cotisations", icone: "cotisant" },
	{
		id: "emploi",
		label: "Emploi et carrières",
		icone: "emploi",
		note: "Ces réglages refont toutes les carrières, comme si la situation avait toujours été celle-là. C'est une comparaison, pas une prévision dans le temps.",
	},
];

export interface Levier {
	id: LevierId;
	groupe: GroupeId;
	label: string;
	min: number;
	max: number;
	pas: number;
	/** Valeur du droit en vigueur ; null quand elle dépend de la génération. */
	defaut: number | null;
	/** Position du curseur au repos quand il n'y a pas de valeur unique. */
	repos?: number;
	affiche: (v: number) => string;
	termes: Terme[];
	/** Ce que le levier change, en une phrase. */
	aide: string;
}

const pourcent = (v: number) => `${v.toLocaleString("fr-FR")} %`;
const signe = (v: number) =>
	`${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("fr-FR")}`;
const ECART_FEMMES = Math.round(HYPOTHESES_TRANCHE_0.ecartSalaireFemmes * 100);

export const LEVIERS: Levier[] = [
	{
		id: "ageLegal",
		groupe: "age",
		label: "Âge légal de départ",
		min: 240,
		max: 272,
		pas: 1,
		defaut: null,
		repos: 256,
		affiche: ageEnClair,
		termes: ["retraites", "cotisants", "pension"],
		aide: "Personne ne peut partir avant cet âge. Le relever garde plus longtemps au travail ceux qui ont un emploi, et fait attendre les autres sans pension.",
	},
	{
		id: "dureeRequise",
		groupe: "age",
		label: "Durée de cotisation requise",
		min: 160,
		max: 184,
		pas: 1,
		defaut: null,
		repos: 172,
		affiche: (v) => `${v} trimestres (${(v / 4).toLocaleString("fr-FR")} ans)`,
		termes: ["retraites", "pension"],
		aide: "Il faut cette durée pour partir sans décote avant 67 ans. L'allonger retarde les départs et réduit la pension de ceux qui partent quand même.",
	},
	{
		id: "meilleuresAnnees",
		groupe: "calcul",
		label: "Années de salaire retenues",
		min: 10,
		max: 42,
		pas: 1,
		defaut: 25,
		affiche: (v) => `les ${v} meilleures`,
		termes: ["pension"],
		aide: "La pension de base se calcule sur la moyenne des meilleures années. En retenir davantage fait entrer de moins bonnes années dans la moyenne, et pénalise les carrières heurtées.",
	},
	{
		id: "tauxPlein",
		groupe: "calcul",
		label: "Taux plein de la pension de base",
		min: 40,
		max: 60,
		pas: 1,
		defaut: 50,
		affiche: pourcent,
		termes: ["pension"],
		aide: "Part du salaire moyen que verse le régime de base pour une carrière complète.",
	},
	{
		id: "valeurPoint",
		groupe: "calcul",
		label: "Valeur du point complémentaire",
		min: 80,
		max: 120,
		pas: 1,
		defaut: 100,
		affiche: (v) => (v === 100 ? "inchangée" : `${signe(v - 100)} %`),
		termes: ["pension"],
		aide: "Chaque point acquis pendant la carrière vaut tant d'euros de pension. Geler ou sous-indexer cette valeur baisse la pension complémentaire de tout le monde, surtout des salaires élevés.",
	},
	{
		id: "minimum",
		groupe: "calcul",
		label: "Minimum contributif",
		min: 0,
		max: 150,
		pas: 10,
		defaut: 100,
		affiche: (v) =>
			v === 0 ? "supprimé" : v === 100 ? "inchangé" : `${signe(v - 100)} %`,
		termes: ["pension"],
		aide: "Plancher de la pension de base pour ceux qui ont le taux plein avec de petits salaires. Il ne touche que le bas de la distribution.",
	},
	{
		id: "trimestresEnfant",
		groupe: "famille",
		label: "Trimestres par enfant pour la mère",
		min: 0,
		max: 12,
		pas: 1,
		defaut: 8,
		affiche: (v) => `${v} trimestres`,
		termes: ["retraites", "pension"],
		aide: "Ces trimestres s'ajoutent à la durée validée des mères. Ils leur permettent de partir plus tôt au taux plein et compensent une partie des interruptions.",
	},
	{
		id: "majorationEnfants",
		groupe: "famille",
		label: "Majoration pour trois enfants",
		min: 0,
		max: 20,
		pas: 1,
		defaut: 10,
		affiche: pourcent,
		termes: ["pension"],
		aide: "Supplément de pension pour chaque parent de trois enfants ou plus. Il est proportionnel à la pension, donc plus élevé en euros pour les hautes pensions.",
	},
	{
		id: "cotisationBase",
		groupe: "financement",
		label: "Cotisation du régime de base",
		min: -3,
		max: 3,
		pas: 0.25,
		defaut: 0,
		affiche: (v) => (v === 0 ? "inchangée" : `${signe(v)} point`),
		termes: ["cotisation"],
		aide: "Points de cotisation ajoutés ou retirés sur le salaire sous le plafond. Les pensions ne changent pas : c'est le coût du travail et le salaire net qui bougent, ce que ce modèle ne suit pas.",
	},
	{
		id: "tauxAppel",
		groupe: "financement",
		label: "Taux d'appel de la complémentaire",
		min: 100,
		max: 150,
		pas: 1,
		defaut: 127,
		affiche: pourcent,
		termes: ["cotisation"],
		aide: "À 127 %, on cotise 1,27 € pour 1 € qui donne des points. Le monter fait payer plus sans donner plus de droits.",
	},
	{
		id: "chomage",
		groupe: "emploi",
		label: "Risque de chômage",
		min: 50,
		max: 150,
		pas: 5,
		defaut: 100,
		affiche: (v) => (v === 100 ? "inchangé" : `${signe(v - 100)} %`),
		termes: ["cotisants", "pension"],
		aide: "Moins de chômage, c'est plus de cotisants aujourd'hui et des carrières plus complètes, donc des pensions un peu plus élevées demain.",
	},
	{
		id: "seniors",
		groupe: "emploi",
		label: "Sorties de l'emploi après 55 ans",
		min: 50,
		max: 150,
		pas: 5,
		defaut: 100,
		affiche: (v) => (v === 100 ? "inchangées" : `${signe(v - 100)} %`),
		termes: ["cotisants", "pension"],
		aide: "Beaucoup de gens ne sont plus en emploi quand ils arrivent à l'âge légal. Garder les seniors au travail change le nombre de cotisants autant que l'âge de départ.",
	},
	{
		id: "interruptions",
		groupe: "emploi",
		label: "Arrêts d'activité après une naissance",
		min: 0,
		max: 200,
		pas: 10,
		defaut: 100,
		affiche: (v) => (v === 100 ? "inchangés" : `${signe(v - 100)} %`),
		termes: ["cotisants", "pension"],
		aide: "Part des mères qui s'arrêtent de travailler après une naissance. C'est par là que passerait une politique de garde d'enfants, avec une ampleur que personne ne connaît bien.",
	},
	{
		id: "tempsPartiel",
		groupe: "emploi",
		label: "Temps partiel des mères",
		min: 0,
		max: 200,
		pas: 10,
		defaut: 100,
		affiche: (v) => (v === 100 ? "inchangé" : `${signe(v - 100)} %`),
		termes: ["cotisation", "pension"],
		aide: "Part des mères qui travaillent à temps partiel tant qu'un enfant a moins de douze ans.",
	},
	{
		id: "salaireFemmes",
		groupe: "emploi",
		label: "Salaire des femmes rapporté aux hommes",
		min: ECART_FEMMES,
		max: 100,
		pas: 1,
		defaut: ECART_FEMMES,
		affiche: pourcent,
		termes: ["cotisation", "pension"],
		aide: "À poste et carrière identiques dans le modèle. À 100 %, l'écart de pension qui reste vient des interruptions et du temps partiel.",
	},
];

export const LEVIER: Record<LevierId, Levier> = Object.fromEntries(
	LEVIERS.map((l) => [l.id, l]),
) as Record<LevierId, Levier>;

/** Réglages de l'utilisateur : seuls les leviers qui s'écartent du droit en vigueur y figurent. */
export type Reglages = Partial<Record<LevierId, number>>;

export interface ScenarioMoteur {
	regles: ReglesScenario;
	facteurs: Facteurs;
}

export function versScenario(r: Reglages): ScenarioMoteur {
	const regles: ReglesScenario = {};
	const facteurs: Facteurs = {};
	if (r.ageLegal !== undefined) regles.ageLegal = r.ageLegal;
	if (r.dureeRequise !== undefined) regles.dureeRequise = r.dureeRequise;
	if (r.meilleuresAnnees !== undefined)
		regles.nbMeilleuresAnnees = r.meilleuresAnnees;
	if (r.tauxPlein !== undefined) regles.tauxPlein = r.tauxPlein / 100;
	if (r.valeurPoint !== undefined) regles.valeurDuPoint = r.valeurPoint / 100;
	if (r.minimum !== undefined) regles.minimumContributif = r.minimum / 100;
	if (r.trimestresEnfant !== undefined)
		regles.mdaParEnfant = r.trimestresEnfant;
	if (r.majorationEnfants !== undefined)
		regles.majorationTroisEnfants = r.majorationEnfants / 100;
	if (r.cotisationBase !== undefined)
		regles.cotisationBase = r.cotisationBase / 100;
	if (r.tauxAppel !== undefined) regles.tauxAppel = r.tauxAppel / 100;
	if (r.chomage !== undefined) facteurs.chomage = r.chomage / 100;
	if (r.seniors !== undefined) facteurs.sortiesSeniors = r.seniors / 100;
	if (r.interruptions !== undefined)
		facteurs.interruptionsNaissance = r.interruptions / 100;
	if (r.tempsPartiel !== undefined)
		facteurs.tempsPartielMeres = r.tempsPartiel / 100;
	if (r.salaireFemmes !== undefined)
		facteurs.ecartSalaireFemmes = r.salaireFemmes / 100;
	return { regles, facteurs };
}

/** Lit des réglages depuis les paramètres d'une URL, en écartant tout ce qui est hors bornes. */
export function lireReglages(search: Record<string, unknown>): Reglages {
	const r: Reglages = {};
	for (const l of LEVIERS) {
		const brut = search[l.id];
		const v =
			typeof brut === "number"
				? brut
				: typeof brut === "string"
					? Number(brut)
					: Number.NaN;
		if (Number.isFinite(v) && v >= l.min && v <= l.max && v !== l.defaut)
			r[l.id] = v;
	}
	return r;
}

/** Décisions types, appliquées une à une sur la page Décisions. */
export interface Decision {
	levier: LevierId;
	valeur: number;
	label: string;
}

export const DECISIONS: Decision[] = [
	{ levier: "ageLegal", valeur: 248, label: "Âge légal à 62 ans pour tous" },
	{ levier: "ageLegal", valeur: 260, label: "Âge légal à 65 ans pour tous" },
	{
		levier: "dureeRequise",
		valeur: 176,
		label: "Durée requise de 44 ans pour tous",
	},
	{
		levier: "meilleuresAnnees",
		valeur: 42,
		label: "Pension de base calculée sur 42 années",
	},
	{ levier: "tauxPlein", valeur: 48, label: "Taux plein ramené à 48 %" },
	{
		levier: "valeurPoint",
		valeur: 95,
		label: "Point complémentaire baissé de 5 %",
	},
	{
		levier: "minimum",
		valeur: 120,
		label: "Minimum contributif relevé de 20 %",
	},
	{
		levier: "trimestresEnfant",
		valeur: 4,
		label: "4 trimestres par enfant au lieu de 8",
	},
	{
		levier: "majorationEnfants",
		valeur: 0,
		label: "Majoration pour trois enfants supprimée",
	},
	{
		levier: "cotisationBase",
		valeur: 1,
		label: "Un point de cotisation de base en plus",
	},
	{
		levier: "tauxAppel",
		valeur: 135,
		label: "Taux d'appel de la complémentaire à 135 %",
	},
	{ levier: "chomage", valeur: 80, label: "Risque de chômage réduit de 20 %" },
	{
		levier: "seniors",
		valeur: 80,
		label: "Sorties de l'emploi après 55 ans réduites de 20 %",
	},
	{
		levier: "interruptions",
		valeur: 50,
		label: "Deux fois moins d'arrêts après une naissance",
	},
	{
		levier: "tempsPartiel",
		valeur: 50,
		label: "Deux fois moins de temps partiel des mères",
	},
	{
		levier: "salaireFemmes",
		valeur: 100,
		label: "Égalité de salaire entre femmes et hommes",
	},
];
