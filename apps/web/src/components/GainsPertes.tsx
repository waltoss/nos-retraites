import type { EcartDecile } from "@nos-retraites/engine";
import { euros } from "../format";

/** Écart de pension par dixième de retraités, du plus modeste au plus aisé. */
export function GainsPertes({ ecarts }: { ecarts: EcartDecile[] }) {
	const pourcents = ecarts.map((e) =>
		e.reference > 0 && e.scenario > 0
			? (e.scenario / e.reference - 1) * 100
			: 0,
	);
	const echelle = Math.max(2, ...pourcents.map(Math.abs));
	const sorties =
		ecarts.reduce((t, e) => t + e.partSortie, 0) / Math.max(1, ecarts.length);
	const plat = pourcents.every((p) => Math.abs(p) < 0.05);
	return (
		<figure className="gains">
			<div
				className="gains-barres"
				role="img"
				aria-label="Écart de pension par dixième de retraités"
			>
				{ecarts.map((e, i) => {
					const p = pourcents[i] ?? 0;
					const hauteur = (Math.abs(p) / echelle) * 50;
					return (
						<div
							className="gain"
							// biome-ignore lint/suspicious/noArrayIndexKey: dix dixièmes fixes et ordonnés
							key={i}
							title={`${euros(e.reference)} avec la loi actuelle, ${euros(e.scenario)} dans votre scénario`}
						>
							<i
								className={p >= 0 ? "haut" : "bas"}
								style={{ height: `${hauteur}%` }}
							/>
							<span
								className={p >= 0 ? "num haut" : "num bas"}
								style={
									p >= 0
										? { bottom: `${50 + hauteur}%` }
										: { top: `${50 + hauteur}%` }
								}
							>
								{Math.abs(p) < 0.05
									? "0"
									: `${p > 0 ? "+" : "−"}${Math.abs(p).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`}
							</span>
						</div>
					);
				})}
			</div>
			<figcaption className="axis">
				<span>Les 10 % de pensions les plus basses</span>
				<span>Les 10 % les plus hautes</span>
			</figcaption>
			<p className="gains-note">
				{plat
					? "Votre scénario ne change la pension d'aucun de ces retraités."
					: "Écart de pension en %, pour les personnes qui sont retraitées dans les deux cas."}
				{sorties > 0.001 &&
					` ${(sorties * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} % des retraités d'aujourd'hui ne le seraient pas encore dans votre scénario.`}
			</p>
		</figure>
	);
}
