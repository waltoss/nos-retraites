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
		const c = (base.population[i] as Individu).carriere;
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
		});
	}
	tous.sort((x, y) => x.reference.mensuelle - y.reference.mensuelle);
	let choisis = tous;
	const tiers = Math.floor(tous.length / 3);
	if (filtre.niveau === "bas") choisis = tous.slice(0, tiers);
	else if (filtre.niveau === "milieu") choisis = tous.slice(tiers, 2 * tiers);
	else if (filtre.niveau === "haut") choisis = tous.slice(2 * tiers);
	else if (filtre.niveau === "touches") {
		const effet = (p: ResumePortrait) =>
			Math.abs(p.scenario.mensuelle - p.reference.mensuelle) /
				Math.max(1, p.reference.mensuelle) +
			Math.abs(p.scenario.age - p.reference.age) / 40;
		choisis = [...tous]
			.sort((x, y) => effet(y) - effet(x))
			.slice(0, Math.max(nombre, Math.floor(tous.length / 10)));
		choisis.sort((x, y) => effet(y) - effet(x));
	}
	const pas = Math.max(1, choisis.length / nombre);
	const pris: ResumePortrait[] = [];
	for (
		let k = 0;
		k < nombre && Math.floor(k * pas + pas / 2) < choisis.length;
		k++
	) {
		pris.push(choisis[Math.floor(k * pas + pas / 2)] as ResumePortrait);
	}
	return { portraits: pris, total: choisis.length };
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
