/** Statistiques pondérées : chaque valeur compte pour son poids (1 par défaut). */

type Valeurs = ArrayLike<number>;

function total(poids: Valeurs | undefined, n: number): number {
	if (!poids) return n;
	let t = 0;
	for (let i = 0; i < n; i++) t += poids[i] as number;
	return t;
}

/** Quantiles pondérés : la plus petite valeur dont le poids cumulé atteint la part demandée. */
export function quantiles(
	valeurs: Valeurs,
	niveaux: number[],
	poids?: Valeurs,
): number[] {
	const n = valeurs.length;
	if (n === 0) return niveaux.map(() => 0);
	const ordre = Uint32Array.from({ length: n }, (_, i) => i).sort(
		(x, y) => (valeurs[x] as number) - (valeurs[y] as number),
	);
	const somme = total(poids, n);
	const resultat: number[] = [];
	let k = 0;
	let cumul = 0;
	for (const p of [...niveaux].sort((x, y) => x - y)) {
		const seuil = p * somme;
		while (k < n - 1) {
			const w = poids ? (poids[ordre[k] as number] as number) : 1;
			if (cumul + w >= seuil) break;
			cumul += w;
			k++;
		}
		resultat.push(valeurs[ordre[k] as number] as number);
	}
	// Rendre les quantiles dans l'ordre demandé.
	const tries = [...niveaux].sort((x, y) => x - y);
	return niveaux.map((p) => resultat[tries.indexOf(p)] as number);
}

export function moyenne(valeurs: Valeurs, poids?: Valeurs): number {
	const n = valeurs.length;
	if (n === 0) return 0;
	let t = 0;
	let w = 0;
	for (let i = 0; i < n; i++) {
		const p = poids ? (poids[i] as number) : 1;
		t += (valeurs[i] as number) * p;
		w += p;
	}
	return w ? t / w : 0;
}

export interface Histogramme {
	max: number;
	/** Part du poids total dans chaque classe. La dernière classe contient aussi les valeurs au-delà de max. */
	classes: number[];
}

export function histogramme(
	valeurs: Valeurs,
	max: number,
	nbClasses: number,
	poids?: Valeurs,
): Histogramme {
	const classes = new Array<number>(nbClasses).fill(0);
	const n = valeurs.length;
	const somme = total(poids, n);
	if (n === 0 || somme === 0) return { max, classes };
	for (let i = 0; i < n; i++) {
		const k = Math.min(
			nbClasses - 1,
			Math.max(0, Math.floor(((valeurs[i] as number) / max) * nbClasses)),
		);
		classes[k] =
			(classes[k] as number) + (poids ? (poids[i] as number) : 1) / somme;
	}
	return { max, classes };
}

export interface Resume {
	/** Somme des poids : le nombre de personnes représentées. */
	effectif: number;
	moyenne: number;
	mediane: number;
	/** Déciles D1 à D9. */
	deciles: number[];
}

export function resume(valeurs: Valeurs, poids?: Valeurs): Resume {
	const deciles = quantiles(
		valeurs,
		[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
		poids,
	);
	return {
		effectif: total(poids, valeurs.length),
		moyenne: moyenne(valeurs, poids),
		mediane: deciles[4] as number,
		deciles,
	};
}
