import {
	BAREMES_FRANCE,
	type Carriere,
	type Etat,
	valeur,
} from "@nos-retraites/engine";

export const ETATS: Record<Etat, { label: string; couleur: string }> = {
	emploi: { label: "En emploi", couleur: "var(--cotisants)" },
	chomage: { label: "Au chômage", couleur: "var(--besoin)" },
	maladieMaternite: { label: "Maladie ou maternité", couleur: "#c9a227" },
	inactivite: { label: "Sans activité", couleur: "#b9b2a6" },
	retraite: { label: "À la retraite", couleur: "var(--retraites)" },
};

const AGE_DEBUT = 16;
const AGE_FIN = 70;

/** Une vie, année par année : la hauteur est le salaire rapporté au plafond, la couleur est l'état. */
export function Frise({
	carriere,
	ageDepart,
	autreAgeDepart,
}: {
	carriere: Carriere;
	ageDepart: number;
	autreAgeDepart?: number;
}) {
	const parAge = new Map(
		carriere.annees.map((a) => [a.annee - carriere.anneeNaissance, a]),
	);
	const colonnes = [];
	for (let age = AGE_DEBUT; age < AGE_FIN; age++) {
		const a = parAge.get(age);
		const retraite = age >= Math.floor(ageDepart / 4);
		const etat: Etat | null = retraite ? "retraite" : (a?.etat ?? null);
		const part =
			a && a.etat === "emploi" && !retraite
				? a.salaireBrut / valeur(BAREMES_FRANCE.cnav.pass, a.annee)
				: 0;
		const hauteur =
			etat === null
				? 0
				: etat === "emploi"
					? Math.max(8, Math.min(100, (part / 2) * 100))
					: 8;
		const naissance = carriere.enfants.includes(carriere.anneeNaissance + age);
		colonnes.push(
			<div
				className="frise-col"
				key={age}
				title={`${age} ans (${carriere.anneeNaissance + age})${etat ? ` : ${ETATS[etat].label.toLowerCase()}` : ""}${part ? `, ${Math.round(a?.salaireBrut ?? 0).toLocaleString("fr-FR")} € bruts` : ""}`}
			>
				{naissance && <b aria-hidden="true" />}
				<i
					style={{
						height: `${hauteur}%`,
						background: etat ? ETATS[etat].couleur : "transparent",
						opacity: etat === "retraite" ? 0.35 : 1,
					}}
				/>
			</div>,
		);
	}
	const position = (age: number) =>
		`${((age / 4 - AGE_DEBUT) / (AGE_FIN - AGE_DEBUT)) * 100}%`;
	return (
		<figure className="frise">
			<div className="frise-zone">
				<div className="frise-plafond">
					<span>Plafond de la Sécurité sociale</span>
				</div>
				<div className="frise-barres">{colonnes}</div>
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
