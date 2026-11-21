import {
	BAREMES_FRANCE,
	type Carriere,
	type Etat,
	moisParEtat,
	valeur,
} from "@nos-retraites/engine";
import { type PointerEvent, useState } from "react";
import { euros } from "../format";
import { cadrer } from "./Histogram";

export const ETATS: Record<Etat, { label: string; couleur: string }> = {
	emploi: { label: "En emploi", couleur: "var(--cotisants)" },
	chomage: { label: "Au chômage", couleur: "var(--besoin)" },
	maladieMaternite: { label: "Maladie ou maternité", couleur: "#c9a227" },
	inactivite: { label: "Sans activité", couleur: "#b9b2a6" },
	retraite: { label: "À la retraite", couleur: "var(--retraites)" },
};

const AGE_DEBUT = 16;
const AGE_FIN = 70;

const pluriel = (n: number) => `${n} mois`;

/** Une vie, année par année : la hauteur est le salaire rapporté au plafond, les couleurs sont les états de l'année. */
export function Frise({
	carriere,
	ageDepart,
	autreAgeDepart,
}: {
	carriere: Carriere;
	ageDepart: number;
	autreAgeDepart?: number;
}) {
	const [survol, setSurvol] = useState<number | null>(null);
	const parAge = new Map(
		carriere.annees.map((a) => [a.annee - carriere.anneeNaissance, a]),
	);
	const nbColonnes = AGE_FIN - AGE_DEBUT;
	const viser = (e: PointerEvent<HTMLDivElement>) => {
		const cadre = e.currentTarget.getBoundingClientRect();
		const k = Math.floor(((e.clientX - cadre.left) / cadre.width) * nbColonnes);
		setSurvol(AGE_DEBUT + Math.max(0, Math.min(nbColonnes - 1, k)));
	};
	/** Ce qui se passe à un âge donné : mois par état, salaire, part du plafond. */
	const lire = (age: number) => {
		const a = parAge.get(age);
		const retraite = age >= Math.floor(ageDepart / 4);
		const m = a && !retraite ? moisParEtat(a) : null;
		const mois = m
			? {
					emploi: m.emploi,
					chomage: m.chomage,
					maladieMaternite: m.maladie,
					inactivite: 12 - m.emploi - m.chomage - m.maladie,
				}
			: null;
		const salaire = a && !retraite ? a.salaireBrut : 0;
		const part = a ? salaire / valeur(BAREMES_FRANCE.cnav.pass, a.annee) : 0;
		return { a, retraite, mois, salaire, part };
	};
	const colonnes = [];
	for (let age = AGE_DEBUT; age < AGE_FIN; age++) {
		const { a, retraite, mois, part } = lire(age);
		const naissance = carriere.enfants.includes(carriere.anneeNaissance + age);
		const blocs: { etat: Etat; hauteur: number }[] = [];
		if (retraite) blocs.push({ etat: "retraite", hauteur: 8 });
		else if (a && mois) {
			if (mois.emploi > 0)
				blocs.push({
					etat: "emploi",
					hauteur: Math.max(8, Math.min(100, (part / 2) * 100)),
				});
			// Les autres états de l'année se posent en petits blocs au-dessus de l'emploi.
			for (const etat of ["chomage", "maladieMaternite", "inactivite"] as const)
				if (mois[etat] > 0)
					blocs.push({ etat, hauteur: mois.emploi > 0 ? 5 : 8 });
		}
		colonnes.push(
			<div
				className={age === survol ? "frise-col vise" : "frise-col"}
				key={age}
			>
				{naissance && <b aria-hidden="true" />}
				<div className="frise-pile">
					{blocs.map((bloc) => (
						<i
							key={bloc.etat}
							style={{
								height: `${bloc.hauteur}%`,
								background: ETATS[bloc.etat].couleur,
								opacity: bloc.etat === "retraite" ? 0.35 : 1,
							}}
						/>
					))}
				</div>
			</div>,
		);
	}
	const vise = survol === null ? null : lire(survol);
	const detailMois = vise?.mois
		? (Object.entries(vise.mois) as [Etat, number][])
				.filter(([, n]) => n > 0)
				.map(([etat, n]) =>
					n === 12
						? `Toute l'année ${ETATS[etat].label.toLowerCase()}`
						: `${pluriel(n)} ${ETATS[etat].label.toLowerCase()}`,
				)
		: [];
	const position = (age: number) =>
		`${((age / 4 - AGE_DEBUT) / (AGE_FIN - AGE_DEBUT)) * 100}%`;
	return (
		<figure className="frise">
			<div className="frise-zone">
				<div className="frise-plafond">
					<span>Plafond de la Sécurité sociale</span>
				</div>
				<div
					className="frise-barres"
					onPointerMove={viser}
					onPointerDown={viser}
					onPointerLeave={() => setSurvol(null)}
				>
					{colonnes}
				</div>
				{survol !== null && vise && (
					<div
						className="bulle num"
						style={{
							left: cadrer(((survol - AGE_DEBUT + 0.5) / nbColonnes) * 100),
							bottom: "calc(100% + 6px)",
						}}
					>
						<strong>
							{survol} ans, en {carriere.anneeNaissance + survol}
						</strong>
						{vise.retraite ? (
							<span>À la retraite</span>
						) : vise.a ? (
							<>
								{detailMois.map((ligne) => (
									<span key={ligne}>{ligne}</span>
								))}
								{vise.salaire > 0 && (
									<span className="avant">
										{euros(vise.salaire)} bruts dans l'année,{" "}
										{Math.round(vise.part * 100)} % du plafond
									</span>
								)}
							</>
						) : (
							<span>Pas encore dans la vie active</span>
						)}
						{carriere.enfants.includes(carriere.anneeNaissance + survol) && (
							<span>Naissance d'un enfant</span>
						)}
					</div>
				)}
				{autreAgeDepart !== undefined && autreAgeDepart !== ageDepart && (
					<div
						className="frise-depart autre"
						style={{ left: position(autreAgeDepart) }}
					/>
				)}
				<div className="frise-depart" style={{ left: position(ageDepart) }} />
			</div>
			<div className="frise-axe num">
				{[20, 30, 40, 50, 60].map((age) => (
					<span key={age} style={{ left: position(age * 4) }}>
						{age} ans
					</span>
				))}
			</div>
			<figcaption className="legende">
				{(Object.keys(ETATS) as Etat[]).map((e) => (
					<span key={e}>
						<i
							style={{
								background: ETATS[e].couleur,
								opacity: e === "retraite" ? 0.35 : 1,
							}}
						/>
						{ETATS[e].label}
					</span>
				))}
				<span>
					<b />
					Naissance d'un enfant
				</span>
			</figcaption>
		</figure>
	);
}
