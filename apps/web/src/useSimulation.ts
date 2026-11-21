import type { ReglesScenario } from "@nos-retraites/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reponse, Requete, ResultatLeger } from "./engine.worker";

export interface EtatSimulation {
	reference: ResultatLeger | null;
	courant: ResultatLeger | null;
	taille: number;
	dureeGenerationMs: number;
	run: (regles: ReglesScenario) => void;
}

/** Pilote le moteur dans un Web Worker ; seules les réponses à la dernière demande sont gardées. */
export function useSimulation(taille: number): EtatSimulation {
	const worker = useRef<Worker | null>(null);
	const dernier = useRef(0);
	const [reference, setReference] = useState<ResultatLeger | null>(null);
	const [courant, setCourant] = useState<ResultatLeger | null>(null);
	const [dureeGenerationMs, setDureeGenerationMs] = useState(0);

	useEffect(() => {
		const w = new Worker(new URL("./engine.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.current = w;
		const envoyer = (r: Requete) => w.postMessage(r);
		w.onmessage = (e: MessageEvent<Reponse>) => {
			const m = e.data;
			if (m.type === "ready") {
				setDureeGenerationMs(m.dureeMs);
				envoyer({ type: "run", id: 0, regles: {} });
				return;
			}
			if (m.id === 0) setReference(m.resultat);
			if (m.id === dernier.current) setCourant(m.resultat);
		};
		envoyer({ type: "init", taille });
		return () => w.terminate();
	}, [taille]);

	const run = useCallback((regles: ReglesScenario) => {
		dernier.current += 1;
		const requete: Requete = { type: "run", id: dernier.current, regles };
		worker.current?.postMessage(requete);
	}, []);

	return { reference, courant, taille, dureeGenerationMs, run };
}
