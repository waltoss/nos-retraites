/// <reference lib="webworker" />
import {
	appliquerRegles,
	BAREMES_FRANCE as B,
	buildComptes,
	type Carriere,
	type CompteCarriere,
	compareScenarios,
	computePension,
	type EcartDecile,
	type Facteurs,
	generatePopulation,
	type Individu,
	type Pension,
	type Resultat,
	runSimulation,
	SCENARIO_REFERENCE,
} from "@nos-retraites/engine";
import type { ScenarioMoteur } from "./leviers";

export type ResultatLeger = Omit<
	Resultat,
	"cotisations" | "pensions" | "pensionParIndividu"
> & {
	cotisations: Omit<Resultat["cotisations"], "valeurs">;
	pensions: Omit<Resultat["pensions"], "valeurs">;
};

export interface FiltrePortraits {
	sexe: "F" | "H" | "tous";
	niveau: "tous" | "bas" | "milieu" | "haut" | "touches";
}

export interface ResumePortrait {
	id: number;
	sexe: "F" | "H";
	anneeNaissance: number;
	enfants: number;
	cadre: boolean;
	reference: { mensuelle: number; age: number };
	scenario: { mensuelle: number; age: number };
	/** Nombre de personnes réelles que cet individu représente. */
	poids: number;
}

export interface DetailPortrait {
	id: number;
	reference: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
	scenario: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
}

export type Requete =
	| { type: "init"; taille: number }
	| { type: "run"; id: number; scenario: ScenarioMoteur }
	| { type: "decisions"; id: number; scenarios: ScenarioMoteur[] }
	| {
			type: "portraits";
			id: number;
			scenario: ScenarioMoteur;
			filtre: FiltrePortraits;
			nombre: number;
	  }
	| {
			type: "portrait";
			id: number;
			scenario: ScenarioMoteur;
			individu: number;
	  };

export type Reponse =
	| { type: "ready" }
	| {
			type: "result";
			id: number;
			reference: ResultatLeger;
			courant: ResultatLeger;
			ecarts: EcartDecile[];
	  }
	| {
			type: "decisions";
			id: number;
			reference: ResultatLeger;
			resultats: ResultatLeger[];
	  }
	| {
			type: "portraits";
			id: number;
			portraits: ResumePortrait[];
			/** Personnes réelles représentées par l'ensemble où les portraits sont tirés. */
			total: number;
	  }
	| { type: "portrait"; id: number; detail: DetailPortrait };

interface Monde {
	population: Individu[];
	comptes: CompteCarriere[];
}

let taille = SCENARIO_REFERENCE.taille;
const mondes = new Map<string, Monde>();
let reference: Resultat | null = null;

/** Une population par jeu de facteurs : les règles, elles, ne changent pas les carrières. */
function monde(facteurs: Facteurs): Monde {
	const cle = JSON.stringify(facteurs);
	let m = mondes.get(cle);
	if (!m) {
		const population = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille, facteurs },
			B,
		);
		m = { population, comptes: buildComptes(population, B) };
		if (mondes.size >= 6) {
			const ancienne = [...mondes.keys()].find((k) => k !== "{}");
			if (ancienne) mondes.delete(ancienne);
		}
		mondes.set(cle, m);
	}
	return m;
}

function simuler(s: ScenarioMoteur): Resultat {
	const m = monde(s.facteurs);
	return runSimulation(m.population, B, s.regles, m.comptes);
}

function referenceCourante(): Resultat {
	if (!reference) reference = simuler({ regles: {}, facteurs: {} });
	return reference;
}

function leger(r: Resultat): ResultatLeger {
	const { pensionParIndividu: _p, cotisations, pensions, ...reste } = r;
	return {
		...reste,
		cotisations: {
			resume: cotisations.resume,
			histogramme: cotisations.histogramme,
		},
		pensions: { resume: pensions.resume, histogramme: pensions.histogramme },
	};
}

const AGE_MIN_PORTRAIT = 60;

function pensionDans(
	s: ScenarioMoteur,
	i: number,
): { carriere: Carriere; compte: CompteCarriere; pension: Pension } {
	const m = monde(s.facteurs);
	const carriere = (m.population[i] as Individu).carriere;
	const compte = m.comptes[i] as CompteCarriere;
	const pension = computePension(carriere, appliquerRegles(B, s.regles), {
		regles: s.regles,
		compte,
	});
	return { carriere, compte, pension };
}

function portraits(
	s: ScenarioMoteur,
	filtre: FiltrePortraits,
	nombre: number,
): { portraits: ResumePortrait[]; total: number } {
	const base = monde({});
	const tous: ResumePortrait[] = [];
	const droit = { regles: {}, facteurs: {} };
	for (let i = 0; i < base.population.length; i++) {
		const individu = base.population[i] as Individu;
		const c = individu.carriere;
		if (B.anneeReference - c.anneeNaissance < AGE_MIN_PORTRAIT) continue;
		if (filtre.sexe !== "tous" && c.sexe !== filtre.sexe) continue;
		const r = pensionDans(droit, i).pension;
		const p = pensionDans(s, i).pension;
		tous.push({
			id: i,
			sexe: c.sexe,
			anneeNaissance: c.anneeNaissance,
			enfants: c.enfants.length,
			cadre: c.cadre,
			reference: { mensuelle: r.mensuelleBrute, age: r.liquidation.age },
			scenario: { mensuelle: p.mensuelleBrute, age: p.liquidation.age },
			poids: individu.poids,
		});
	}
	tous.sort((x, y) => x.reference.mensuelle - y.reference.mensuelle);
	const poids = (liste: ResumePortrait[]) =>
		liste.reduce((t, p) => t + p.poids, 0);
	/** Tranche de la liste triée, entre deux parts du poids total. */
	const tranche = (de: number, a: number) => {
		const total = poids(tous);
		let cumul = 0;
		return tous.filter((p) => {
			const milieu = (cumul + p.poids / 2) / total;
			cumul += p.poids;
			return milieu >= de && milieu < a;
		});
	};
	let choisis = tous;
	if (filtre.niveau === "bas") choisis = tranche(0, 1 / 3);
	else if (filtre.niveau === "milieu") choisis = tranche(1 / 3, 2 / 3);
	else if (filtre.niveau === "haut") choisis = tranche(2 / 3, 1.01);
	else if (filtre.niveau === "touches") {
		const effet = (p: ResumePortrait) =>
			Math.abs(p.scenario.mensuelle - p.reference.mensuelle) /
				Math.max(1, p.reference.mensuelle) +
			Math.abs(p.scenario.age - p.reference.age) / 40;
		choisis = [...tous]
			.sort((x, y) => effet(y) - effet(x))
			.slice(0, Math.max(nombre, Math.floor(tous.length / 10)));
	}
	// Tirage représentatif : un portrait au milieu de chaque part égale du poids total.
	const total = poids(choisis);
	const pris: ResumePortrait[] = [];
	let cumul = 0;
	let k = 0;
	for (const p of choisis) {
		cumul += p.poids;
		while (k < nombre && cumul >= ((k + 0.5) / nombre) * total) {
			if (pris[pris.length - 1] !== p) pris.push(p);
			k++;
		}
	}
	return { portraits: pris, total };
}

const envoyer = (r: Reponse) => self.postMessage(r);

self.onmessage = (e: MessageEvent<Requete>) => {
	const m = e.data;
	switch (m.type) {
		case "init":
			taille = m.taille;
			mondes.clear();
			reference = null;
			referenceCourante();
			envoyer({ type: "ready" });
			break;
		case "run": {
			const ref = referenceCourante();
			const courant = simuler(m.scenario);
			envoyer({
				type: "result",
				id: m.id,
				reference: leger(ref),
				courant: leger(courant),
				ecarts: compareScenarios(
					ref.pensionParIndividu,
					courant.pensionParIndividu,
					monde({}).population.map((i) => i.poids),
				),
			});
			break;
		}
		case "decisions":
			envoyer({
				type: "decisions",
				id: m.id,
				reference: leger(referenceCourante()),
				resultats: m.scenarios.map((s) => leger(simuler(s))),
			});
			break;
		case "portraits":
			envoyer({
				type: "portraits",
				id: m.id,
				...portraits(m.scenario, m.filtre, m.nombre),
			});
			break;
		case "portrait":
			envoyer({
				type: "portrait",
				id: m.id,
				detail: {
					id: m.individu,
					reference: pensionDans({ regles: {}, facteurs: {} }, m.individu),
					scenario: pensionDans(m.scenario, m.individu),
				},
			});
			break;
	}
};
