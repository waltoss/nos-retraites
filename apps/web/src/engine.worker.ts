/// <reference lib="webworker" />
import {
	BAREMES_FRANCE,
	buildComptes,
	type CompteCarriere,
	generatePopulation,
	type Individu,
	type ReglesScenario,
	type Resultat,
	runSimulation,
	SCENARIO_REFERENCE,
} from "@nos-retraites/engine";

export type Requete =
	| { type: "init"; taille: number }
	| { type: "run"; id: number; regles: ReglesScenario };

export type ResultatLeger = Omit<Resultat, "cotisations" | "pensions"> & {
	cotisations: Omit<Resultat["cotisations"], "valeurs">;
	pensions: Omit<Resultat["pensions"], "valeurs">;
};

export type Reponse =
	| { type: "ready"; taille: number; dureeMs: number }
	| { type: "result"; id: number; resultat: ResultatLeger };

let population: Individu[] = [];
let comptes: CompteCarriere[] = [];

const envoyer = (r: Reponse) => self.postMessage(r);

self.onmessage = (e: MessageEvent<Requete>) => {
	const m = e.data;
	if (m.type === "init") {
		const debut = performance.now();
		population = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille: m.taille },
			BAREMES_FRANCE,
		);
		comptes = buildComptes(population, BAREMES_FRANCE);
		envoyer({
			type: "ready",
			taille: m.taille,
			dureeMs: performance.now() - debut,
		});
		return;
	}
	const r = runSimulation(population, BAREMES_FRANCE, m.regles, comptes);
	envoyer({
		type: "result",
		id: m.id,
		resultat: {
			...r,
			cotisations: {
				resume: r.cotisations.resume,
				histogramme: r.cotisations.histogramme,
			},
			pensions: {
				resume: r.pensions.resume,
				histogramme: r.pensions.histogramme,
			},
		},
	});
};
