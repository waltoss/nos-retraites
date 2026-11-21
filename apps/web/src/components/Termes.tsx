import { TERMES, type Terme } from "../leviers";
import { Icon } from "./Icons";

const ORDRE = Object.keys(TERMES) as Terme[];

/** Termes de l'équation en toutes lettres : sert de légende aux pastilles. */
export function TermesEnClair({ termes = ORDRE }: { termes?: Terme[] }) {
	return (
		<span className="termes">
			{termes.map((t) => (
				<span key={t} className={`terme ${TERMES[t].cote}`}>
					<Icon name={TERMES[t].icone} size={14} />
					{TERMES[t].label.toLowerCase()}
				</span>
			))}
		</span>
	);
}

/** Les quatre termes en pastilles, chacun toujours à la même place pour se lire en colonne. */
export function PastillesTermes({ termes }: { termes: Terme[] }) {
	return (
		<span className="pastilles">
			{ORDRE.map((t) =>
				termes.includes(t) ? (
					<span
						key={t}
						className={`terme ${TERMES[t].cote}`}
						title={TERMES[t].label}
					>
						<Icon name={TERMES[t].icone} size={14} />
						<span className="sr">{TERMES[t].label}</span>
					</span>
				) : (
					<span key={t} />
				),
			)}
		</span>
	);
}
