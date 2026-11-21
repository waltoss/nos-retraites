import { useEffect, useState } from "react";
import { GROUPES, type GroupeId, LEVIERS, type Levier } from "../leviers";
import { useScenario } from "../scenario";
import { Icon } from "./Icons";
import { TermesEnClair } from "./Termes";

function CurseurLevier({ levier }: { levier: Levier }) {
	const { reglages, regler } = useScenario();
	const valeur = reglages[levier.id];
	const modifie = valeur !== undefined;
	const position = valeur ?? levier.defaut ?? levier.repos ?? levier.min;
	const texte =
		modifie || levier.defaut !== null
			? levier.affiche(position)
			: "Loi actuelle";
	const id = `levier-${levier.id}`;
	// L'aide ne s'ouvre qu'à la demande : rien ne bouge au survol ni pendant un réglage.
	const [aide, setAide] = useState(false);
	return (
		<div className={modifie ? "levier modifie" : "levier"}>
			<div className="levier-tete">
				<label htmlFor={id}>{levier.label}</label>
				<output htmlFor={id} className="num">
					{texte}
				</output>
			</div>
			<div className="levier-corps">
				<input
					id={id}
					type="range"
					min={levier.min}
					max={levier.max}
					step={levier.pas}
					value={position}
					onChange={(e) => regler(levier.id, Number(e.target.value))}
					aria-valuetext={texte}
				/>
				<button
					type="button"
					className="mini"
					onClick={() => setAide(!aide)}
					aria-expanded={aide}
					aria-controls={`${id}-aide`}
					aria-label={`Explication de « ${levier.label} »`}
				>
					<Icon name="info" size={18} />
				</button>
				<button
					type="button"
					className="mini"
					onClick={() => regler(levier.id, null)}
					disabled={!modifie}
					aria-label={`Remettre « ${levier.label} » à la loi actuelle`}
				>
					<Icon name="retour" size={16} />
				</button>
			</div>
			<p className="levier-aide" id={`${id}-aide`} hidden={!aide}>
				{levier.aide}
				{levier.termes.length > 0 && <TermesEnClair termes={levier.termes} />}
			</p>
		</div>
	);
}

export function PanneauLeviers() {
	const { reglages, remplacer, modifies } = useScenario();
	const touches = GROUPES.filter((g) =>
		LEVIERS.some((l) => l.groupe === g.id && reglages[l.id] !== undefined),
	).map((g) => g.id);
	// Un groupe s'ouvre quand un de ses leviers est réglé, mais seul l'utilisateur le referme.
	const [ouverts, setOuverts] = useState<GroupeId[]>(() => ["age", ...touches]);
	const cle = touches.join(" ");
	useEffect(() => {
		const ids = cle ? (cle.split(" ") as GroupeId[]) : [];
		setOuverts((o) =>
			ids.every((id) => o.includes(id)) ? o : [...new Set([...o, ...ids])],
		);
	}, [cle]);
	return (
		<aside className="panneau" aria-label="Leviers du scénario">
			<div className="panneau-tete">
				<strong>Votre scénario</strong>
				<button
					type="button"
					className="reset"
					onClick={() => remplacer({})}
					disabled={modifies === 0}
				>
					<Icon name="retour" size={16} />
					<span>Loi actuelle</span>
				</button>
			</div>
			{GROUPES.map((g) => {
				const leviers = LEVIERS.filter((l) => l.groupe === g.id);
				const changes = leviers.filter(
					(l) => reglages[l.id] !== undefined,
				).length;
				return (
					<details
						key={g.id}
						open={ouverts.includes(g.id)}
						onToggle={(e) => {
							const ouvert = e.currentTarget.open;
							setOuverts((o) =>
								o.includes(g.id) === ouvert
									? o
									: ouvert
										? [...o, g.id]
										: o.filter((id) => id !== g.id),
							);
						}}
					>
						<summary>
							<Icon name={g.icone} size={20} />
							<span>{g.label}</span>
							{changes > 0 && <em className="num">{changes}</em>}
						</summary>
						{g.note && <p className="groupe-note">{g.note}</p>}
						{g.resume && (
							<p className="groupe-resume num">{g.resume(reglages)}</p>
						)}
						{leviers.map((l) => (
							<CurseurLevier key={l.id} levier={l} />
						))}
					</details>
				);
			})}
		</aside>
	);
}
