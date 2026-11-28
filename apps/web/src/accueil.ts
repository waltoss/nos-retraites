import donnees from "./accueil.json";

/**
 * Chiffres figés par `bun scripts/build-accueil.ts` : la loi actuelle et chaque scénario type,
 * calculés par le moteur du site à la construction. L'accueil et la page Scénarios les affichent
 * tout de suite, sans faire tourner le moteur sur le téléphone.
 */
export interface Fige {
	/** Solde de tous les régimes par année, en millions d'euros de l'année de référence. */
	soldes: number[];
	/** Le même solde en points de PIB. */
	pib: number[];
	/** Âge moyen de départ des salariés du privé, par année. */
	ages: number[];
	/** Âge de départ et première pension de deux générations. */
	generations: Record<string, { age: number; pension: number }>;
}

export const DEBUT: number = donnees.debut;
export const FIN = DEBUT + donnees.loi.soldes.length - 1;
export const LOI: Fige = donnees.loi;
export const figeDe = (id: string): Fige | undefined =>
	(donnees.scenarios as Record<string, Fige>)[id];

/** Solde d'une année, en milliards d'euros. */
export const solde = (f: Fige, annee: number) =>
	(f.soldes[annee - DEBUT] ?? 0) / 1000;
export const age = (f: Fige, annee: number) => f.ages[annee - DEBUT] ?? 0;
/** Somme des soldes de toutes les années, en milliards d'euros. */
export const cumul = (f: Fige) => f.soldes.reduce((t, s) => t + s, 0) / 1000;
/** La trajectoire du solde, pour une courbe. */
export const trajectoire = (f: Fige) =>
	f.soldes.map((s, i) => ({ x: DEBUT + i, y: s / 1000 }));
