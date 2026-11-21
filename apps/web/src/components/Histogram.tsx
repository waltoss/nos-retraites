import type { Histogramme } from "@nos-retraites/engine";
import { type PointerEvent, useState } from "react";
import { entier, euros, personnes } from "../format";

interface Props {
	courant: Histogramme;
	reference: Histogramme;
	mediane: number;
	couleur: string;
	description: string;
	/** Nombre de personnes représentées par l'histogramme, pour le scénario et pour la loi actuelle. */
	effectif: number;
	effectifReference: number;
	/** « des cotisants », « des retraités ». */
	population: string;
	/** « par an », « par mois ». */
	periode: string;
}

/** Position d'une bulle : centrée sur le point, sans sortir du graphique. */
export const cadrer = (pourcent: number) =>
	`clamp(84px, ${pourcent}%, calc(100% - 84px))`;

const combien = (n: number) =>
	n >= 1e6 ? personnes(n) : entier(Math.round(n / 1000) * 1000);

/** Histogramme en barres ; un trait fin rappelle la hauteur du scénario de référence. */
export function Histogram({
	courant,
	reference,
	mediane,
	couleur,
	description,
	effectif,
	effectifReference,
	population,
	periode,
}: Props) {
	const [survol, setSurvol] = useState<number | null>(null);
	const n = courant.classes.length;
	const echelle = Math.max(...courant.classes, ...reference.classes, 1e-9);
	const positionMediane = Math.min(100, (mediane / courant.max) * 100);
	const viser = (e: PointerEvent<HTMLDivElement>) => {
		const cadre = e.currentTarget.getBoundingClientRect();
		const k = Math.floor(((e.clientX - cadre.left) / cadre.width) * n);
		setSurvol(Math.max(0, Math.min(n - 1, k)));
	};
	const largeur = courant.max / n;
	const part = survol === null ? 0 : (courant.classes[survol] ?? 0);
	const partReference = survol === null ? 0 : (reference.classes[survol] ?? 0);
	const ici = part * effectif;
	const avant = partReference * effectifReference;
	return (
		<figure className="histo" aria-label={description}>
			<div
				className="bars"
				onPointerMove={viser}
				onPointerDown={viser}
				onPointerLeave={() => setSurvol(null)}
			>
				{courant.classes.map((p, i) => {
					const ref = reference.classes[i] ?? 0;
					return (
						<div
							className={i === survol ? "col vise" : "col"}
							// biome-ignore lint/suspicious/noArrayIndexKey: les classes sont fixes et ordonnées
							key={i}
						>
							<i
								style={{
									height: `${(p / echelle) * 100}%`,
									background: couleur,
								}}
							/>
							<b style={{ bottom: `${(ref / echelle) * 100}%` }} />
						</div>
					);
				})}
				{survol !== null && (
					<div
						className="bulle num"
						style={{
							left: cadrer(((survol + 0.5) / n) * 100),
							bottom: `calc(${(Math.max(part, partReference) / echelle) * 100}% + 10px)`,
						}}
					>
						<strong>
							{survol === n - 1
								? `${euros(courant.max)} et plus ${periode}`
								: `De ${euros(survol * largeur)} à ${euros((survol + 1) * largeur)} ${periode}`}
						</strong>
						<span>
							{combien(ici)} personnes,{" "}
							{(part * 100).toLocaleString("fr-FR", {
								maximumFractionDigits: 1,
							})}{" "}
							% {population}
						</span>
						{Math.abs(ici - avant) >= 1000 && (
							<span className="avant">
								{combien(avant)} avec la loi actuelle
							</span>
						)}
					</div>
				)}
			</div>
			<div className="median" style={{ left: `${positionMediane}%` }}>
				<span className={positionMediane > 60 ? "num gauche" : "num"}>
					médiane {euros(mediane)}
				</span>
			</div>
			<figcaption className="axis num">
				<span>0 €</span>
				<span>{euros(courant.max)} et plus</span>
			</figcaption>
		</figure>
	);
}
