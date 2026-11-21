import type { ResultatLeger } from "../engine.worker";
import { euros, milliards, personnes } from "../format";
import {
	LEVIER,
	type LevierId,
	type Reglages,
	TERMES,
	type Terme,
} from "../leviers";
import { Icon } from "./Icons";

function variation(valeur: number, reference: number): string {
	if (!reference) return "";
	const p = (valeur / reference - 1) * 100;
	if (Math.abs(p) < 0.05) return "";
	return `${p > 0 ? "+" : "−"}${Math.abs(p).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function Case(props: {
	terme: Terme;
	valeur: string;
	ecart: string;
	touche: boolean;
}) {
	const t = TERMES[props.terme];
	return (
		<div className={`case ${t.cote}${props.touche ? " touche" : ""}`}>
			<span className="case-nom">
				<Icon name={t.icone} size={18} />
				{t.label}
			</span>
			<strong className="num">{props.valeur}</strong>
			<em className="num">{props.ecart || "\u00a0"}</em>
		</div>
	);
}

/** Les deux côtés de l'équation, terme par terme, avec l'écart au droit en vigueur. */
export function Equation({
	reference,
	courant,
	reglages,
}: {
	reference: ResultatLeger;
	courant: ResultatLeger;
	reglages: Reglages;
}) {
	const touches = new Set<Terme>();
	for (const id of Object.keys(reglages) as LevierId[])
		for (const t of LEVIER[id].termes) touches.add(t);
	const ecartCotisations = variation(
		courant.masses.cotisations,
		reference.masses.cotisations,
	);
	const ecartPensions = variation(
		courant.masses.pensions,
		reference.masses.pensions,
	);
	return (
		<div className="equation">
			<div className="cote">
				<div className="produit">
					<Case
						terme="cotisants"
						valeur={personnes(courant.effectifs.cotisants)}
						ecart={variation(
							courant.effectifs.cotisants,
							reference.effectifs.cotisants,
						)}
						touche={touches.has("cotisants")}
					/>
					<span className="op">×</span>
					<Case
						terme="cotisation"
						valeur={`${euros(courant.cotisations.resume.moyenne)} par an`}
						ecart={variation(
							courant.cotisations.resume.moyenne,
							reference.cotisations.resume.moyenne,
						)}
						touche={touches.has("cotisation")}
					/>
				</div>
				<p className="masse ressources">
					Cotisations versées par an{" "}
					<strong className="num">
						{milliards(courant.masses.cotisations)}
					</strong>
					{ecartCotisations && <em className="num"> {ecartCotisations}</em>}
				</p>
			</div>
			<div className="cote">
				<div className="produit">
					<Case
						terme="retraites"
						valeur={personnes(courant.effectifs.retraites)}
						ecart={variation(
							courant.effectifs.retraites,
							reference.effectifs.retraites,
						)}
						touche={touches.has("retraites")}
					/>
					<span className="op">×</span>
					<Case
						terme="pension"
						valeur={`${euros(courant.pensions.resume.moyenne)} par mois`}
						ecart={variation(
							courant.pensions.resume.moyenne,
							reference.pensions.resume.moyenne,
						)}
						touche={touches.has("pension")}
					/>
				</div>
				<p className="masse depenses">
					Pensions versées par an{" "}
					<strong className="num">{milliards(courant.masses.pensions)}</strong>
					{ecartPensions && <em className="num"> {ecartPensions}</em>}
				</p>
			</div>
		</div>
	);
}
