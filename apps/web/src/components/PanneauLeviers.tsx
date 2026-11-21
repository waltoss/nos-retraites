import { GROUPES, LEVIERS, type Levier, TERMES } from "../leviers";
import { useScenario } from "../scenario";
import { Icon } from "./Icons";

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
					onClick={() => regler(levier.id, null)}
					disabled={!modifie}
					aria-label={`Remettre « ${levier.label} » à la loi actuelle`}
				>
					<Icon name="retour" size={16} />
				</button>
			</div>
			<p className="levier-aide">
				{levier.aide}
				{levier.termes.length > 0 && (
					<span className="termes">
						{levier.termes.map((t) => (
							<span key={t} className={`terme ${TERMES[t].cote}`}>
								<Icon name={TERMES[t].icone} size={14} />
								{TERMES[t].label.toLowerCase()}
							</span>
						))}
					</span>
				)}
			</p>
		</div>
	);
}

export function PanneauLeviers() {
	const { reglages, remplacer, modifies } = useScenario();
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
					<details key={g.id} open={g.id === "age" || changes > 0}>
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
