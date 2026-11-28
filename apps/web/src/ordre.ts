import { useEffect, useState } from "react";
import { PROGRAMMES, type ScenarioType } from "./scenarios";

const CLE = "ordre-programmes";
let graineDeSecours: number | null = null;

/** La graine de cet appareil : tirée à la première visite, gardée dans le navigateur, jamais envoyée. */
function graine(): number {
	try {
		const lue = Number(window.localStorage.getItem(CLE));
		if (Number.isInteger(lue) && lue > 0) return lue;
		const tiree = 1 + Math.floor(Math.random() * 0x7fffffff);
		window.localStorage.setItem(CLE, String(tiree));
		return tiree;
	} catch {
		// Stockage refusé (navigation privée) : l'ordre tient le temps de la visite.
		graineDeSecours ??= 1 + Math.floor(Math.random() * 0x7fffffff);
		return graineDeSecours;
	}
}

/** Mélange de Fisher-Yates sur un générateur à graine (mulberry32) : même graine, même ordre. */
export function melanger<T>(liste: readonly T[], g: number): T[] {
	let etat = g >>> 0;
	const alea = () => {
		etat = (etat + 0x6d2b79f5) >>> 0;
		let t = etat;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const suite = [...liste];
	for (let i = suite.length - 1; i > 0; i--) {
		const j = Math.floor(alea() * (i + 1));
		[suite[i], suite[j]] = [suite[j] as T, suite[i] as T];
	}
	return suite;
}

/**
 * Les programmes dans l'ordre tiré au sort sur cet appareil, le même sur toutes les pages et à
 * chaque visite. `null` tant que le navigateur n'a pas lu sa graine : le serveur ne la connaît pas.
 */
export function useOrdreProgrammes(): ScenarioType[] | null {
	const [ordre, setOrdre] = useState<ScenarioType[] | null>(null);
	useEffect(() => {
		// Départ sur les identifiants triés : l'ordre du fichier ne pèse pas sur le tirage.
		const tries = [...PROGRAMMES].sort((a, b) => a.id.localeCompare(b.id));
		setOrdre(melanger(tries, graine()));
	}, []);
	return ordre;
}
