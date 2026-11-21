/** Quantiles d'un échantillon (les poids sont uniformes en tranche 0). */
export function quantiles(valeurs: ArrayLike<number>, niveaux: number[]): number[] {
	const tri = Float64Array.from(valeurs).sort();
	const n = tri.length;
	return niveaux.map((p) => {
		if (n === 0) return 0;
		const pos = p * (n - 1);
		const bas = Math.floor(pos);
		const haut = Math.min(n - 1, bas + 1);
		return (tri[bas] as number) + ((tri[haut] as number) - (tri[bas] as number)) * (pos - bas);
	});
}

export function moyenne(valeurs: ArrayLike<number>): number {
	let total = 0;
	for (let i = 0; i < valeurs.length; i++) total += valeurs[i] as number;
	return valeurs.length ? total / valeurs.length : 0;
}

export interface Histogramme {
	max: number;
	/** Part de l'échantillon dans chaque classe. La dernière classe contient aussi les valeurs au-delà de max. */
	classes: number[];
}

export function histogramme(valeurs: ArrayLike<number>, max: number, nbClasses: number): Histogramme {
	const classes = new Array<number>(nbClasses).fill(0);
	const n = valeurs.length;
	if (n === 0) return { max, classes };
	for (let i = 0; i < n; i++) {
		const k = Math.min(nbClasses - 1, Math.max(0, Math.floor(((valeurs[i] as number) / max) * nbClasses)));
		classes[k] = (classes[k] as number) + 1 / n;
	}
	return { max, classes };
}

export interface Resume {
	effectif: number;
	moyenne: number;
	mediane: number;
	/** Déciles D1 à D9. */
	deciles: number[];
}

export function resume(valeurs: ArrayLike<number>): Resume {
	const deciles = quantiles(valeurs, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
	return { effectif: valeurs.length, moyenne: moyenne(valeurs), mediane: deciles[4] as number, deciles };
}
