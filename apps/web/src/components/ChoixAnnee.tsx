import { ANNEES } from "../leviers";
import { useScenario } from "../scenario";

/** Choix de l'année de la projection que montrent les chiffres et les distributions. */
export function ChoixAnnee() {
	const { annee, setAnnee } = useScenario();
	return (
		<fieldset className="choix-annee">
			<legend>Regarder l'année</legend>
			{ANNEES.map((a) => (
				<button
					type="button"
					key={a}
					className={a === annee ? "puce actif" : "puce"}
					aria-pressed={a === annee}
					onClick={() => setAnnee(a)}
				>
					{a}
				</button>
			))}
		</fieldset>
	);
}
