import type { Histogramme } from "@nos-retraites/engine";
import { euros } from "../format";

interface Props {
	courant: Histogramme;
	reference: Histogramme;
	mediane: number;
	couleur: string;
	description: string;
}

/** Histogramme en barres ; un trait fin rappelle la hauteur du scénario de référence. */
export function Histogram({
	courant,
	reference,
	mediane,
	couleur,
	description,
}: Props) {
	const echelle = Math.max(...courant.classes, ...reference.classes, 1e-9);
	const positionMediane = Math.min(100, (mediane / courant.max) * 100);
	return (
		<figure className="histo" aria-label={description}>
			<div className="bars">
				{courant.classes.map((part, i) => {
					const ref = reference.classes[i] ?? 0;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: les classes sont fixes et ordonnées
						<div className="col" key={i}>
							<i
								style={{
									height: `${(part / echelle) * 100}%`,
									background: couleur,
								}}
							/>
							<b style={{ bottom: `${(ref / echelle) * 100}%` }} />
						</div>
					);
				})}
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
