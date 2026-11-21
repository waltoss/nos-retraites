const nombre = (decimales: number) =>
	new Intl.NumberFormat("fr-FR", {
		minimumFractionDigits: decimales,
		maximumFractionDigits: decimales,
	});

const ENTIER = nombre(0);
const UNE_DECIMALE = nombre(1);

export const euros = (n: number) =>
	`${ENTIER.format(Math.round(n / 10) * 10)} €`;
export const entier = (n: number) => ENTIER.format(n);
export const decimal = (n: number) => UNE_DECIMALE.format(n);

/** « 62 ans 9 mois » à partir d'un âge en trimestres. */
export function ageEnClair(trimestres: number): string {
	const ans = Math.floor(trimestres / 4);
	const mois = (trimestres % 4) * 3;
	return mois === 0 ? `${ans} ans` : `${ans} ans ${mois} mois`;
}

/** Écart signé, ou chaîne vide quand il est négligeable. */
export function ecart(
	valeur: number,
	reference: number,
	format: (n: number) => string,
	seuil: number,
): string {
	const d = valeur - reference;
	if (Math.abs(d) < seuil) return "";
	return `${d > 0 ? "+" : "−"}${format(Math.abs(d))}`;
}
