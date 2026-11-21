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

/** Quantile de la loi normale centrée réduite (approximation d'Acklam, erreur inférieure à 1e-8). */
export function quantileNormal(p: number): number {
	const a = [
		-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
		-30.66479806614716, 2.506628277459239,
	] as const;
	const b = [
		-54.47609879822406, 161.5858368580409, -155.6989798598866,
		66.80131188771972, -13.28068155288572,
	] as const;
	const c = [
		-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
		-2.549732539343734, 4.374664141464968, 2.938163982698783,
	] as const;
	const d = [
		0.007784695709041462, 0.3224671290700398, 2.445134137142996,
		3.754408661907416,
	] as const;
	const bas = 0.02425;
	if (p <= 0) return Number.NEGATIVE_INFINITY;
	if (p >= 1) return Number.POSITIVE_INFINITY;
	if (p < bas) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (
			(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
			((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
		);
	}
	if (p > 1 - bas) return -quantileNormal(1 - p);
	const q = p - 0.5;
	const r = q * q;
	return (
		((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
			q) /
		(((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
	);
}
