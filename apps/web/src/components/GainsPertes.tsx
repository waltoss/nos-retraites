import type { EcartDecile } from "@nos-retraites/engine";
import { type PointerEvent, useState } from "react";
import { euros } from "../format";
import { cadrer } from "./Histogram";

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
	const [survol, setSurvol] = useState<number | null>(null);
	const viser = (e: PointerEvent<HTMLDivElement>) => {
		const cadre = e.currentTarget.getBoundingClientRect();
		const k = Math.floor(
			((e.clientX - cadre.left) / cadre.width) * ecarts.length,
		);
		setSurvol(Math.max(0, Math.min(ecarts.length - 1, k)));
	};
	const vise = survol === null ? null : ecarts[survol];
	const ecartVise = survol === null ? 0 : (pourcents[survol] ?? 0);
	return (
		<figure className="gains">
			<div
				className="gains-barres"
				role="img"
				aria-label="Écart de pension par dixième de retraités"
				onPointerMove={viser}
				onPointerDown={viser}
				onPointerLeave={() => setSurvol(null)}
			>
				{ecarts.map((_, i) => {
					const p = pourcents[i] ?? 0;
					const hauteur = (Math.abs(p) / echelle) * 38;
					return (
						<div
							className={i === survol ? "gain vise" : "gain"}
							// biome-ignore lint/suspicious/noArrayIndexKey: dix dixièmes fixes et ordonnés
							key={i}
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
				{vise && survol !== null && (
					<div
						className="bulle num"
						style={{
							left: cadrer(((survol + 0.5) / ecarts.length) * 100),
							top: 0,
						}}
					>
						<strong>
							{survol === 0
								? "Les 10 % de pensions les plus basses"
								: survol === ecarts.length - 1
									? "Les 10 % de pensions les plus hautes"
									: `${survol + 1}e dixième des pensions`}
						</strong>
						<span>
							{euros(vise.scenario)} par mois en moyenne dans votre scénario
						</span>
						<span className="avant">
							{euros(vise.reference)} avec la loi actuelle
							{Math.abs(ecartVise) >= 0.05 &&
								`, soit ${ecartVise > 0 ? "+" : "−"}${Math.abs(ecartVise).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
						</span>
						{vise.partSortie > 0.001 && (
							<span className="avant">
								{(vise.partSortie * 100).toLocaleString("fr-FR", {
									maximumFractionDigits: 0,
								})}{" "}
								% d'entre eux ne seraient pas encore retraités
							</span>
						)}
					</div>
				)}
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
					` ${(sorties * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} % d'entre eux ne seraient pas encore partis dans votre scénario.`}
			</p>
		</figure>
	);
}
