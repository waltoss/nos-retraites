/**
 * Noms et couleurs des affiliations et des régimes, tels que le site les montre.
 * Le moteur ne connaît que leurs identifiants ; rien ici n'entre dans un calcul.
 */
import {
	type AnneeCarriere,
	type Carriere,
	MODELE,
	moisParEtat,
	type Pension,
} from "@nos-retraites/engine";

export const AFFILIATIONS: Record<
	string,
	{ label: string; court: string; couleur: string }
> = {
	prive: {
		label: "Salarié du privé",
		court: "salarié du privé",
		couleur: "var(--cotisants)",
	},
	salarieAgricole: {
		label: "Salarié agricole (MSA)",
		court: "salarié agricole",
		couleur: "#7a8c2e",
	},
	sre: {
		label: "Fonctionnaire de l'État",
		court: "fonctionnaire de l'État",
		couleur: "#3d5a99",
	},
	cnracl: {
		label: "Fonctionnaire territorial ou hospitalier",
		court: "fonctionnaire territorial ou hospitalier",
		couleur: "#3d5a99",
	},
	militaire: { label: "Militaire", court: "militaire", couleur: "#4f6b3a" },
	artisan: { label: "Artisan", court: "artisan", couleur: "#b5542d" },
	commercant: { label: "Commerçant", court: "commerçant", couleur: "#b5542d" },
	autre: {
		label: "Autre régime, non simulé",
		court: "dans un régime non simulé",
		couleur: "#b9b2a6",
	},
};

const ETAGES = {
	base: "retraite de base",
	complementaire: "retraite complémentaire",
	integre: "base et complémentaire en une seule pension",
} as const;

export const REGIMES: Record<
	string,
	{ label: string; court: string; aide?: string }
> = {
	cnav: {
		label: "Régime général",
		court: "Régime général",
		aide: "Assurance retraite (Cnav)",
	},
	agircArrco: { label: "Agirc-Arrco", court: "Agirc-Arrco" },
	sre: { label: "Service des retraites de l'État", court: "État" },
	cnracl: {
		label: "CNRACL",
		court: "CNRACL",
		aide: "agents des collectivités locales et des hôpitaux",
	},
	militaire: { label: "Pensions militaires de l'État", court: "Armées" },
	ssi: {
		label: "Sécurité sociale des indépendants",
		court: "Indépendants",
		aide: "retraite de base des artisans et commerçants",
	},
	rci: {
		label: "Complémentaire des indépendants",
		court: "RCI",
		aide: "RCI",
	},
};

/** Régimes qui versent quelque chose à une personne, dans l'ordre du modèle. */
export function regimesVerseurs(pension: Pension): string[] {
	return MODELE.regimes
		.filter((r) => {
			const d = pension.parRegime[r.id];
			return (
				d !== undefined &&
				(d.pensionAnnuelle > 0 ||
					("versementUnique" in d && d.versementUnique === true))
			);
		})
		.map((r) => r.id);
}

export const affiliationDe = (a: AnneeCarriere) =>
	AFFILIATIONS[a.affiliation] ?? AFFILIATIONS.autre;

/** Le statut d'une année en toutes lettres, accordé : « salariée du privé », « commerçante ». */
export function statutDe(a: AnneeCarriere, sexe: "F" | "H"): string {
	const court = affiliationDe(a)?.court ?? "";
	return sexe === "F"
		? court.replace(/^(salarié|commerçant|artisan)\b/, "$1e")
		: court;
}

export interface LigneRegime {
	id: string;
	label: string;
	aide: string;
	/** Années travaillées, avant le départ, sous une affiliation qui cotise à ce régime. */
	annees: number;
	/** Pension annuelle versée par ce régime. */
	pensionAnnuelle: number;
	/** Vrai quand les droits sont trop petits pour une pension : un capital est versé une fois. */
	capital: boolean;
	/** Régime aligné dont la pension est calculée et comptée avec celle du régime général. */
	jointe?: boolean;
}

/**
 * Les régimes d'une personne : ceux auxquels elle a cotisé et ce que chacun lui verse.
 * Les années passées dans un régime que le modèle ne simule pas forment une dernière ligne, sans pension.
 */
export function regimesDe(
	carriere: Carriere,
	pension: Pension,
): { lignes: LigneRegime[]; anneesNonSimulees: number } {
	const anneeDepart = pension.liquidation.annee;
	const parAffiliation = new Map<string, number>();
	for (const a of carriere.annees) {
		if (a.annee >= anneeDepart) break;
		const mois = moisParEtat(a).emploi;
		if (mois > 0)
			parAffiliation.set(
				a.affiliation,
				(parAffiliation.get(a.affiliation) ?? 0) + mois / 12,
			);
	}
	const lignes: LigneRegime[] = [];
	for (const regime of MODELE.regimes) {
		const d = pension.parRegime[regime.id];
		let annees = 0;
		for (const [affiliation, n] of parAffiliation)
			if (MODELE.affiliations[affiliation]?.regimes.includes(regime.id))
				annees += n;
		const capital =
			d !== undefined && "versementUnique" in d && d.versementUnique === true;
		const pensionAnnuelle = d?.pensionAnnuelle ?? 0;
		if (annees === 0 && pensionAnnuelle === 0 && !capital) continue;
		const nom = REGIMES[regime.id];
		lignes.push({
			id: regime.id,
			label: nom?.label ?? regime.id,
			aide: [nom?.aide, ETAGES[regime.etage]].filter(Boolean).join(", "),
			annees,
			pensionAnnuelle,
			capital,
		});
		// La retraite additionnelle des fonctionnaires, sur leurs primes, est une caisse à part.
		if (d && "rafp" in d && typeof d.rafp === "number")
			lignes.push({
				id: "rafp",
				label: "Retraite additionnelle (RAFP)",
				aide: "sur les primes, par capitalisation",
				annees,
				pensionAnnuelle: d.rafp,
				capital: d.rafp === 0,
			});
	}
	// Salariés agricoles : la MSA tient leurs années, mais la pension de base est unique.
	const agricoles = parAffiliation.get("salarieAgricole") ?? 0;
	if (agricoles > 0) {
		const general = lignes.find((l) => l.id === "cnav");
		if (general) general.annees -= agricoles;
		lignes.splice(general ? lignes.indexOf(general) + 1 : 0, 0, {
			id: "msa",
			label: "Mutualité sociale agricole (MSA)",
			aide: "années de salarié agricole : même calcul, une seule retraite de base avec le régime général",
			annees: agricoles,
			pensionAnnuelle: 0,
			capital: false,
			jointe: true,
		});
	}
	let anneesNonSimulees = 0;
	for (const [affiliation, n] of parAffiliation)
		if (!MODELE.affiliations[affiliation]) anneesNonSimulees += n;
	return { lignes, anneesNonSimulees };
}
