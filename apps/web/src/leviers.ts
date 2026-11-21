import {
	type Demographie,
	type Facteurs,
	HYPOTHESES,
	NIVEAUX_DEMOGRAPHIE,
	type ReglesScenario,
} from "@nos-retraites/engine";
import type { IconName } from "./components/Icons";
import { ageEnClair } from "./format";
import politiques from "./politiques.json";

export type LevierId =
	| "ageLegal"
	| "dureeRequise"
	| "meilleuresAnnees"
	| "tauxPlein"
	| "valeurPoint"
	| "revalorisation"
	| "minimum"
	| "trimestresEnfant"
	| "majorationEnfants"
	| "cotisationBase"
	| "tauxAppel"
	| "chomage"
	| "seniors"
	| "interruptions"
	| "tempsPartiel"
	| "salaireFemmes"
	| "natalite"
	| "immigration"
	| "creches"
	| "congeParental"
	| "aidesFamilles"
	| "hypotheseNatalite";

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

export type GroupeId =
	| "age"
	| "calcul"
	| "famille"
	| "financement"
	| "emploi"
	| "population"
	| "politiquesFamiliales";

export const GROUPES: {
	id: GroupeId;
	label: string;
	icone: IconName;
	note?: string;
	/** Ce que les réglages du groupe donnent, en une phrase. */
	resume?: (r: Reglages) => string;
}[] = [
	{ id: "age", label: "Âge et durée", icone: "age" },
	{ id: "calcul", label: "Calcul de la pension", icone: "pension" },
	{ id: "famille", label: "Droits liés aux enfants", icone: "famille" },
	{ id: "financement", label: "Cotisations", icone: "cotisant" },
	{
		id: "emploi",
		label: "Emploi et carrières",
		icone: "emploi",
		note: "Ces réglages ne changent les carrières qu'à partir de 2028. Leur effet sur les pensions met donc des décennies à se voir.",
	},
	{
		id: "population",
		label: "Population",
		icone: "population",
		note: "Ces deux réglages restent dans les bornes des projections de l'Insee. Ils ne disent pas quelle politique permettrait d'y arriver.",
	},
	{
		id: "politiquesFamiliales",
		label: "Politiques familiales",
		icone: "famille",
		note: "Ici on règle une politique, et le modèle en déduit une natalité d'après les réformes évaluées dans d'autres pays. Les études ne s'accordent pas : choisissez l'hypothèse basse, centrale ou haute. Le coût de ces politiques, hors du système de retraite, n'est pas compté.",
		resume: (r) => {
			const effet = effetPolitiquesFamiliales(r);
			const base = (r.natalite ?? DEFAUT_NATALITE) / 100;
			const nombre = (x: number) =>
				x.toLocaleString("fr-FR", { minimumFractionDigits: 2 });
			if (effet === 0)
				return `Natalité retenue : ${nombre(base)} enfant par femme, aucune politique ajoutée.`;
			const retenue = feconditeRetenue(r);
			const plafonnee = Math.abs(base + effet - retenue) > 0.001;
			return `Natalité retenue : ${nombre(base)} + ${nombre(effet)} = ${nombre(base + effet)} enfant par femme${plafonnee ? `, ramenée à ${nombre(retenue)}, la limite des projections de l'Insee` : ""}.`;
		},
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
const ECART_FEMMES = Math.round(HYPOTHESES.ecartSalaireFemmes * 100);

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
		affiche: (v) => `${(v / 4).toLocaleString("fr-FR")} ans (${v} trim.)`,
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
		id: "revalorisation",
		groupe: "calcul",
		label: "Revalorisation des pensions versées",
		min: -20,
		max: 10,
		pas: 1,
		defaut: 0,
		affiche: (v) => (v === 0 ? "comme les prix" : `prix ${signe(v / 10)} pt`),
		termes: ["pension"],
		aide: "Une pension déjà versée suit les prix. La revaloriser moins vite la fait baisser un peu chaque année en pouvoir d'achat, pour tous les retraités. C'est le levier le plus souvent utilisé, et son effet ne se voit que dans le temps : regardez les trajectoires jusqu'en 2070.",
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
	{
		id: "natalite",
		groupe: "population",
		label: "Natalité",
		min: Math.round(NIVEAUX_DEMOGRAPHIE.fecondite.bas * 100),
		max: Math.round(NIVEAUX_DEMOGRAPHIE.fecondite.haut * 100),
		pas: 5,
		defaut: Math.round(NIVEAUX_DEMOGRAPHIE.fecondite.central * 100),
		affiche: (v) =>
			`${(v / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} enfant par femme`,
		termes: ["cotisants"],
		aide: "Nombre moyen d'enfants par femme dans les années qui viennent. Un enfant né en 2030 commence à cotiser vers 2052 : l'effet n'apparaît qu'en fin de trajectoire, et grandit ensuite.",
	},
	{
		id: "immigration",
		groupe: "population",
		label: "Solde migratoire",
		min: NIVEAUX_DEMOGRAPHIE.soldeMigratoire.bas / 1000,
		max: NIVEAUX_DEMOGRAPHIE.soldeMigratoire.haut / 1000,
		pas: 10,
		defaut: NIVEAUX_DEMOGRAPHIE.soldeMigratoire.central / 1000,
		affiche: (v) => `${v} 000 entrées nettes par an`,
		termes: ["cotisants", "retraites"],
		aide: "Entrées moins sorties du territoire, chaque année. On arrive surtout à l'âge de travailler : l'effet sur les cotisants est rapide, celui sur les retraités vient trente ans plus tard. Le modèle prête aux arrivants la carrière des personnes de leur âge.",
	},
	{
		id: "creches",
		groupe: "politiquesFamiliales",
		label: "Places d'accueil des moins de 3 ans",
		min: 0,
		max: 30,
		pas: 5,
		defaut: 0,
		affiche: (v) =>
			v === 0 ? "comme aujourd'hui" : `+${v} places pour 100 enfants`,
		termes: ["cotisants"],
		aide: "Crèches et assistantes maternelles. C'est la politique dont l'effet durable sur les naissances est le mieux établi, en Allemagne et en Norvège. La France part déjà d'un niveau élevé : le gain y est sans doute plus faible.",
	},
	{
		id: "congeParental",
		groupe: "politiquesFamiliales",
		label: "Congé parental mieux indemnisé",
		min: 0,
		max: 1,
		pas: 1,
		defaut: 0,
		affiche: (v) => (v === 0 ? "comme aujourd'hui" : "réforme d'ampleur"),
		termes: ["cotisants"],
		aide: "Un congé plus long ou payé en proportion du salaire. Les études y voient surtout des naissances avancées, pas forcément plus d'enfants au total, et parfois un effet négatif.",
	},
	{
		id: "aidesFamilles",
		groupe: "politiquesFamiliales",
		label: "Aides financières aux familles",
		min: 0,
		max: 10,
		pas: 1,
		defaut: 0,
		affiche: (v) =>
			v === 0
				? "comme aujourd'hui"
				: `+${(v / 10).toLocaleString("fr-FR")} pt de PIB par an`,
		termes: ["cotisants"],
		aide: "Allocations, primes de naissance, avantages fiscaux. Un point de PIB, c'est environ 30 milliards d'euros par an. Les primes font monter les naissances tant qu'elles sont récentes ; l'effet durable est discuté, de nul à modeste.",
	},
	{
		id: "hypotheseNatalite",
		groupe: "politiquesFamiliales",
		label: "Efficacité de ces politiques",
		min: 0,
		max: 2,
		pas: 1,
		defaut: 1,
		affiche: (v) =>
			["hypothèse basse", "hypothèse centrale", "hypothèse haute"][v] ?? "",
		termes: [],
		aide: "Basse : ces politiques ne changent pas le nombre d'enfants. Centrale et haute : elles le font monter, d'après les évaluations les plus favorables. Ce réglage ne change rien tant qu'aucune politique n'est activée.",
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
	demographie: Demographie;
}

const DEFAUT_NATALITE = Math.round(NIVEAUX_DEMOGRAPHIE.fecondite.central * 100);
const FOURCHETTES = ["bas", "central", "haut"] as const;
const effetFamille = (id: string, r: Reglages): number => {
	const f = politiques.familles.find((x) => x.id === id);
	return f?.effet[FOURCHETTES[r.hypotheseNatalite ?? 1] ?? "central"] ?? 0;
};

/**
 * Enfants par femme en plus attendus des politiques familiales réglées, selon l'hypothèse choisie.
 * Les fourchettes viennent de data/references/elasticites.json (lecture de la littérature, extrapolée à la France).
 */
export function effetPolitiquesFamiliales(r: Reglages): number {
	return (
		// Fourchette donnée pour +10 places pour 100 enfants.
		((r.creches ?? 0) / 10) * effetFamille("accueilJeunesEnfants", r) +
		(r.congeParental ?? 0) * effetFamille("congeParental", r) +
		// Fourchette donnée pour +1 point de PIB ; le curseur est en dixièmes de point.
		((r.aidesFamilles ?? 0) / 10) * effetFamille("aidesFinancieres", r)
	);
}

/** Natalité transmise au moteur : le réglage direct plus l'effet des politiques, dans les bornes de l'Insee. */
export function feconditeRetenue(r: Reglages): number {
	const n = NIVEAUX_DEMOGRAPHIE.fecondite;
	return Math.max(
		n.bas,
		Math.min(
			n.haut,
			(r.natalite ?? DEFAUT_NATALITE) / 100 + effetPolitiquesFamiliales(r),
		),
	);
}

export function versScenario(r: Reglages): ScenarioMoteur {
	const regles: ReglesScenario = {};
	const facteurs: Facteurs = {};
	const demographie: Demographie = {};
	const fecondite = feconditeRetenue(r);
	if (fecondite !== NIVEAUX_DEMOGRAPHIE.fecondite.central)
		demographie.fecondite = fecondite;
	if (r.immigration !== undefined)
		demographie.soldeMigratoire = r.immigration * 1000;
	if (r.ageLegal !== undefined) regles.ageLegal = r.ageLegal;
	if (r.dureeRequise !== undefined) regles.dureeRequise = r.dureeRequise;
	if (r.meilleuresAnnees !== undefined)
		regles.nbMeilleuresAnnees = r.meilleuresAnnees;
	if (r.tauxPlein !== undefined) regles.tauxPlein = r.tauxPlein / 100;
	if (r.valeurPoint !== undefined) regles.valeurDuPoint = r.valeurPoint / 100;
	if (r.revalorisation !== undefined)
		regles.revalorisationReelle = r.revalorisation / 1000;
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
	return { regles, facteurs, demographie };
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
		levier: "revalorisation",
		valeur: -10,
		label: "Pensions revalorisées un point sous les prix",
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
	{
		levier: "natalite",
		valeur: 170,
		label: "Natalité à 1,70 enfant par femme",
	},
	{
		levier: "natalite",
		valeur: 120,
		label: "Natalité à 1,20 enfant par femme",
	},
	{
		levier: "immigration",
		valeur: 230,
		label: "Solde migratoire à 230 000 par an",
	},
	{
		levier: "immigration",
		valeur: 70,
		label: "Solde migratoire à 70 000 par an",
	},
	{
		levier: "creches",
		valeur: 20,
		label: "20 places d'accueil de plus pour 100 jeunes enfants",
	},
	{
		levier: "aidesFamilles",
		valeur: 10,
		label: "Un point de PIB d'aides aux familles en plus",
	},
];

/** Années de la projection que l'on peut regarder. */
export const ANNEES = [2030, 2040, 2050, 2070] as const;
export const ANNEE_DEFAUT = 2040;
export function lireAnnee(search: Record<string, unknown>): number {
	const v = Number(search.annee);
	return (ANNEES as readonly number[]).includes(v) ? v : ANNEE_DEFAUT;
}
