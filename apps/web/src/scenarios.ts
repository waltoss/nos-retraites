import type { Reglages } from "./leviers";

/**
 * Scénarios tout faits : les grandes options du débat, décrites par leurs réglages.
 * Ils ne portent le nom d'aucun parti ni d'aucun candidat, et aucun n'est mis en avant.
 * Les six premiers reprennent les mesures chiffrées de programmes de la présidentielle de 2027,
 * dans la limite de ce que le simulateur sait régler : sources et mesures laissées de côté dans
 * data/references/programmes-2027.json.
 */
export interface ScenarioType {
	id: string;
	titre: string;
	/** Ce que le scénario change, en une ou deux phrases. */
	texte: string;
	reglages: Reglages;
}

export const SCENARIOS: ScenarioType[] = [
	{
		id: "62-ans",
		titre: "Revenir à 62 ans",
		texte:
			"La réforme de 2023 est abrogée : l'âge légal redescend à 62 ans. La durée de cotisation reste de 43 ans.",
		reglages: { ageLegal: 248 },
	},
	{
		id: "60-ans",
		titre: "60 ans, 40 années et plus de décote",
		texte:
			"L'âge légal revient à 60 ans, il suffit de 40 années pour une pension complète et la décote disparaît. Le minimum de pension est relevé de moitié, le plus haut que le simulateur sache régler.",
		reglages: { ageLegal: 240, dureeRequise: 160, decote: 0, minimum: 150 },
	},
	{
		id: "premier-emploi",
		titre: "De 60 à 62 ans selon l'âge du premier emploi",
		texte:
			"L'âge légal est de 62 ans avec 42 années de cotisation, et baisse de six mois par année de début plus précoce, jusqu'à 60 ans et 40 années pour un début avant 20 ans. S'y ajoute un compte de retraite par capitalisation, payé par d'autres prélèvements que les cotisations de retraite : 1,5 % du salaire ici, d'après un montant annoncé peu précis.",
		reglages: {
			ageLegal: 248,
			dureeRequise: 168,
			avanceDebut: 8,
			debutSansAvance: 23,
			capitalisation: 1.5,
		},
	},
	{
		id: "63-65",
		titre: "63 ans au plus tôt, taux plein à 65 ans",
		texte:
			"L'âge légal s'arrête à 63 ans, la décote disparaît à 65 ans au lieu de 67, et elle passe à 7 % par année manquante. Un compte par capitalisation reçoit 1 % du salaire, en plus des cotisations.",
		reglages: {
			ageLegal: 252,
			ageTauxPlein: 260,
			decote: 7,
			capitalisation: 1,
		},
	},
	{
		id: "65-ans",
		titre: "65 ans, 45 années et de la capitalisation",
		texte:
			"L'âge légal monte à 65 ans et la durée de cotisation à 45 ans. Un compte par capitalisation s'ajoute pour tous les salariés : son niveau n'est pas annoncé, 2 % du salaire ici pour fixer les idées.",
		reglages: { ageLegal: 260, dureeRequise: 180, capitalisation: 2 },
	},
	{
		id: "gel",
		titre: "Geler les pensions un an, sauf les petites",
		texte:
			"L'âge suit la loi actuelle. En 2028 les pensions ne sont pas revalorisées : elles perdent la hausse des prix de l'année, environ 1,8 %, et ne la rattrapent pas. Le seuil qui protège les petites pensions n'est pas annoncé : 1 500 € bruts par mois ici.",
		reglages: {
			revalorisation: -18,
			revalorisationDuree: 1,
			revalorisationSeuil: 1500,
		},
	},
	{
		id: "pensions",
		titre: "Faire porter l'effort sur les pensions",
		texte:
			"L'âge ne bouge pas. Les pensions versées augmentent chaque année un point de moins que les prix.",
		reglages: { revalorisation: -10 },
	},
	{
		id: "cotisations",
		titre: "Faire porter l'effort sur les cotisations",
		texte:
			"L'âge ne bouge pas. Deux points de cotisation en plus sur les salaires du privé.",
		reglages: { cotisationBase: 2 },
	},
	{
		id: "public-prive",
		titre: "Rapprocher le public du privé",
		texte:
			"La pension des fonctionnaires se calcule sur leurs 25 meilleures années, primes comprises, et les catégories actives perdent leur départ anticipé. Rien ne change pour le privé.",
		reglages: {
			traitementFonctionnaires: 25,
			primesFonctionnaires: 1,
			categoriesActives: 0,
		},
	},
	{
		id: "emploi",
		titre: "Miser sur l'emploi",
		texte:
			"Aucune règle ne change. Le chômage recule d'un cinquième, les seniors restent plus souvent en emploi et les mères s'arrêtent deux fois moins après une naissance.",
		reglages: { chomage: 80, seniors: 80, interruptions: 50 },
	},
	{
		id: "familles-immigration",
		titre: "Miser sur les naissances et l'immigration",
		texte:
			"L'âge ne bouge pas. Plus de places de crèche, un congé parental mieux payé, des aides aux familles, et un solde migratoire de 230 000 personnes par an.",
		reglages: {
			creches: 30,
			congeParental: 1,
			aidesFamilles: 5,
			immigration: 230,
		},
	},
];
