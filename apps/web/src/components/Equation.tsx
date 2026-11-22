import { useState } from "react";
import type { ResultatLeger } from "../engine.worker";
import { euros, milliards, personnes } from "../format";
import { interetsLus, type Lecture, soldeLu, versementsEtat } from "../lecture";
import {
	LEVIER,
	type LevierId,
	type Reglages,
	TERMES,
	type Terme,
} from "../leviers";
import { cadrer } from "./Histogram";
import { Icon } from "./Icons";

const signe = (x: number) =>
	`${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;

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
	lecture,
}: {
	reference: ResultatLeger;
	courant: ResultatLeger;
	reglages: Reglages;
	/** Lecture du solde choisie sur la page : versements de l'État, intérêts. */
	lecture: Lecture;
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
	const sys = courant.systeme;
	const sysReference = reference.systeme;
	const solde = soldeLu(sys, lecture);
	const soldeReference = soldeLu(sysReference, lecture);
	/** Écart de solde du système entier, en milliards : positif, il faut trouver moins d'argent. */
	const effet = (solde - soldeReference) / 1e9;
	const besoin = Math.max(0, -solde);
	const excedent = Math.max(0, solde);
	const autres =
		sys.autresRessources - (lecture.horsEtat ? versementsEtat(sys) : 0);
	// Des intérêts nets positifs sont une ressource ; négatifs, une dépense de plus.
	const interets = interetsLus(sys, lecture);
	const produits = Math.max(0, interets);
	const charges = Math.max(0, -interets);
	const depenses = sys.depenses + charges;
	const pleine = Math.max(depenses, sys.cotisations + autres + produits);
	const largeur = (x: number) => `${(x / pleine) * 100}%`;
	const [survol, setSurvol] = useState<number | null>(null);
	const segments = [
		{ cle: "cot", nom: "Cotisations", montant: sys.cotisations },
		{ cle: "autres", nom: "Autres ressources", montant: autres },
		...(produits > 0
			? [{ cle: "interets", nom: "Intérêts des réserves", montant: produits }]
			: []),
		...(besoin > 0
			? [{ cle: "besoin", nom: "Besoin de financement", montant: besoin }]
			: []),
	];
	const vise = survol === null ? undefined : segments[survol];
	const avant = segments
		.slice(0, survol ?? 0)
		.reduce((s, x) => s + x.montant, 0);
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
			<div className="systeme">
				<h3>Tous régimes confondus, en {courant.anneeReference}</h3>
				<p className="unit">
					{milliards(sys.depenses)} de dépenses de retraite
					{charges > 0 && `, plus ${milliards(charges)} d'intérêts de la dette`}
					, à payer avec :
				</p>
				<div className="systeme-piste">
					<div
						className="systeme-barre"
						role="img"
						aria-label="Ce qui finance les retraites"
						onPointerLeave={() => setSurvol(null)}
					>
						{segments.map((x, k) => (
							<i
								key={x.cle}
								className={k === survol ? `${x.cle} vise` : x.cle}
								style={{ width: largeur(x.montant) }}
								onPointerEnter={() => setSurvol(k)}
								onPointerDown={() => setSurvol(k)}
							/>
						))}
					</div>
					{vise && (
						<div
							className="bulle num"
							style={{
								left: cadrer(((avant + vise.montant / 2) / pleine) * 100),
								bottom: "calc(100% + 6px)",
							}}
						>
							<strong>{vise.nom}</strong>
							<span>{milliards(vise.montant)}</span>
							<span className="avant">
								{Math.round((vise.montant / depenses) * 100)} % des dépenses de
								retraite
							</span>
						</div>
					)}
				</div>
				<ul className="systeme-legende">
					<li className="cot">
						<strong className="num">{milliards(sys.cotisations)}</strong>
						de cotisations
					</li>
					<li className="autres">
						<strong className="num">{milliards(autres)}</strong>
						{lecture.horsEtat
							? "d'autres ressources : CSG, impôts affectés, transferts, sans les versements de l'État à ses propres régimes"
							: "d'autres ressources : CSG, impôts affectés, transferts, versements de l'État à ses propres régimes"}
					</li>
					{lecture.interets && (
						<li className="interets">
							<strong className="num">{milliards(Math.abs(interets))}</strong>
							{interets >= 0
								? "d'intérêts : ce que rapportent les réserves des caisses, moins ce que coûte la dette"
								: "d'intérêts de la dette, nets de ce que rapportent les réserves et comptés dans le besoin"}
						</li>
					)}
					<li className="besoin">
						<strong className="num">
							{milliards(besoin > 0 ? besoin : excedent)}
						</strong>
						{besoin > 0
							? "qui manquent : le besoin de financement"
							: "d'excédent"}
						, soit{" "}
						{(Math.abs(solde / sys.pib) * 100).toLocaleString("fr-FR", {
							maximumFractionDigits: 1,
						})}{" "}
						% du PIB
					</li>
				</ul>
				<p
					className={`equilibre${effet > 0 ? " mieux" : effet < 0 ? " pire" : ""}`}
				>
					{Math.abs(effet) < 0.5 ? (
						"Votre scénario ne change pas ce besoin de financement."
					) : (
						<>
							Avec la loi actuelle, le solde serait de{" "}
							{signe(soldeReference / 1e9)} milliards. Votre scénario{" "}
							{effet > 0 ? "l'améliore" : "le dégrade"} de{" "}
							<strong className="num">
								{Math.abs(effet).toLocaleString("fr-FR", {
									maximumFractionDigits: 0,
								})}{" "}
								milliards d'euros
							</strong>{" "}
							cette année-là.
						</>
					)}
				</p>
			</div>
		</div>
	);
}
