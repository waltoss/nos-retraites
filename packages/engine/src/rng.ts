/** Générateur pseudo-aléatoire à graine (mulberry32) : mêmes tirages d'un scénario à l'autre. */
export interface Rng {
	/** Uniforme sur [0, 1[. */
	next(): number;
	/** Loi normale centrée réduite. */
	normal(): number;
}

export function createRng(graine: number): Rng {
	let a = graine >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const normal = () => {
		const u = Math.max(next(), 1e-12);
		const v = next();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	};
	return { next, normal };
}

/** Dérive une graine indépendante pour un individu, stable quel que soit l'ordre de calcul. */
export function graineIndividu(graine: number, id: number): number {
	let h = (graine ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	return (h ^ (h >>> 16)) >>> 0;
}
