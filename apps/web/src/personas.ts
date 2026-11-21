/**
 * Habillage des portraits : un prénom et un métier donnés à titre d'exemple.
 * Rien ici ne vient d'une statistique ni n'entre dans le calcul : le modèle ne connaît
 * que le sexe, l'année de naissance, les enfants, les salaires et les périodes d'emploi.
 */
type Sexe = "F" | "H";

/** Prénoms courants par décennie de naissance. */
const PRENOMS: Record<Sexe, Record<number, string[]>> = {
	F: {
		1930: [
			"Jacqueline",
			"Monique",
			"Jeannine",
			"Denise",
			"Simone",
			"Yvette",
			"Ginette",
			"Colette",
		],
		1940: [
			"Michèle",
			"Danielle",
			"Françoise",
			"Nicole",
			"Christiane",
			"Annie",
			"Josiane",
			"Fatima",
		],
		1950: [
			"Martine",
			"Brigitte",
			"Chantal",
			"Catherine",
			"Sylvie",
			"Patricia",
			"Dominique",
			"Zohra",
		],
		1960: [
			"Nathalie",
			"Isabelle",
			"Valérie",
			"Véronique",
			"Christine",
			"Corinne",
			"Laurence",
			"Malika",
		],
		1970: [
			"Sandrine",
			"Stéphanie",
			"Céline",
			"Karine",
			"Virginie",
			"Sophie",
			"Christelle",
			"Nadia",
		],
		1980: [
			"Aurélie",
			"Émilie",
			"Julie",
			"Élodie",
			"Laëtitia",
			"Mélanie",
			"Audrey",
			"Samira",
		],
		1990: [
			"Laura",
			"Marine",
			"Camille",
			"Pauline",
			"Manon",
			"Sarah",
			"Marie",
			"Fatou",
		],
		2000: ["Léa", "Emma", "Chloé", "Inès", "Océane", "Clara", "Lina", "Jade"],
	},
	H: {
		1930: [
			"Jean",
			"André",
			"Pierre",
			"René",
			"Michel",
			"Claude",
			"Roger",
			"Jacques",
		],
		1940: [
			"Bernard",
			"Alain",
			"Gérard",
			"Daniel",
			"Jean-Pierre",
			"Christian",
			"Jean-Claude",
			"Ahmed",
		],
		1950: [
			"Patrick",
			"Philippe",
			"Jean-Luc",
			"Dominique",
			"Pascal",
			"Thierry",
			"Didier",
			"Mohamed",
		],
		1960: [
			"Éric",
			"Laurent",
			"Christophe",
			"Frédéric",
			"Olivier",
			"Stéphane",
			"Bruno",
			"Karim",
		],
		1970: [
			"Sébastien",
			"David",
			"Nicolas",
			"Jérôme",
			"Franck",
			"Ludovic",
			"Cédric",
			"Rachid",
		],
		1980: [
			"Julien",
			"Guillaume",
			"Thomas",
			"Romain",
			"Mathieu",
			"Anthony",
			"Mehdi",
			"Jonathan",
		],
		1990: [
			"Kevin",
			"Alexandre",
			"Maxime",
			"Quentin",
			"Florian",
			"Antoine",
			"Mamadou",
			"Yanis",
		],
		2000: ["Lucas", "Théo", "Hugo", "Enzo", "Nathan", "Léo", "Rayan", "Louis"],
	},
};

/** Métiers types par niveau de salaire : [au féminin, au masculin]. */
const METIERS: Record<"bas" | "milieu" | "haut" | "cadre", [string, string][]> =
	{
		bas: [
			["aide à domicile", "aide à domicile"],
			["agente d'entretien", "agent d'entretien"],
			["caissière", "caissier"],
			["ouvrière agricole", "ouvrier agricole"],
			["serveuse", "serveur"],
			["manutentionnaire", "manutentionnaire"],
			["employée de libre-service", "employé de libre-service"],
		],
		milieu: [
			["secrétaire", "secrétaire"],
			["conductrice routière", "conducteur routier"],
			["aide-soignante en clinique", "aide-soignant en clinique"],
			["vendeuse", "vendeur"],
			["ouvrière du bâtiment", "ouvrier du bâtiment"],
			["comptable", "comptable"],
			["mécanicienne", "mécanicien"],
			["cuisinière", "cuisinier"],
		],
		haut: [
			["technicienne de maintenance", "technicien de maintenance"],
			["cheffe d'équipe", "chef d'équipe"],
			["commerciale", "commercial"],
			["infirmière en clinique", "infirmier en clinique"],
			["dessinatrice industrielle", "dessinateur industriel"],
		],
		cadre: [
			["ingénieure", "ingénieur"],
			["directrice commerciale", "directeur commercial"],
			["cadre bancaire", "cadre bancaire"],
			[
				"responsable des ressources humaines",
				"responsable des ressources humaines",
			],
			["cheffe de projet informatique", "chef de projet informatique"],
		],
	};

/** Mélange stable d'un identifiant, pour que la même personne garde le même habillage. */
function melange(id: number, sel: number): number {
	let h = (id + 1) * 2654435761 + sel * 40503;
	h = (h ^ (h >>> 15)) * 2246822519;
	return (h ^ (h >>> 13)) >>> 0;
}

export interface Persona {
	prenom: string;
	/** Métier d'exemple, ou null quand la personne a très peu travaillé. */
	metier: string | null;
}

export function persona(p: {
	id: number;
	sexe: Sexe;
	anneeNaissance: number;
	cadre: boolean;
	/** Salaire moyen à temps plein sur la carrière, en part du plafond de la Sécurité sociale. */
	niveauSalaire: number;
	anneesEmploi: number;
}): Persona {
	const decennie = Math.max(
		1930,
		Math.min(2000, Math.floor(p.anneeNaissance / 10) * 10),
	);
	const prenoms = PRENOMS[p.sexe][decennie] ?? [];
	const prenom = prenoms[melange(p.id, 1) % prenoms.length] ?? "";
	if (p.anneesEmploi < 8) return { prenom, metier: null };
	const niveau = p.cadre
		? "cadre"
		: p.niveauSalaire < 0.55
			? "bas"
			: p.niveauSalaire < 0.9
				? "milieu"
				: "haut";
	const metiers = METIERS[niveau];
	const paire = metiers[melange(p.id, 2) % metiers.length];
	return { prenom, metier: paire?.[p.sexe === "F" ? 0 : 1] ?? null };
}

export { melange };
