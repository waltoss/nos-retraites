import { melange } from "../personas";

const PEAUX = ["#F2D3B8", "#E3B591", "#C68E65", "#8E5B3C"];
const CHEVEUX = ["#2B2420", "#5A3B26", "#8A5A32", "#B98B4E"];
const GRIS = ["#D9D5CE", "#BDB8B0", "#EDEAE4"];
const FONDS = ["#DCEBE9", "#F6E3CF", "#E9DDE6", "#E7E3D8"];
const HAUTS = ["#0E7C7B", "#D9730D", "#7A3E6B", "#3E5C76", "#6B665E"];

/** Petit portrait dessiné, sans visage, stable pour une même personne. Purement décoratif. */
export function Avatar({
	id,
	sexe,
	age,
	size = 44,
}: {
	id: number;
	sexe: "F" | "H";
	age: number;
	size?: number;
}) {
	const choix = <T,>(liste: T[], sel: number) =>
		liste[melange(id, sel) % liste.length] as T;
	const peau = choix(PEAUX, 3);
	const cheveux = age >= 62 ? choix(GRIS, 4) : choix(CHEVEUX, 4);
	const clip = `avatar-${id}`;
	const long = sexe === "F" && melange(id, 6) % 4 !== 0;
	const degarni = sexe === "H" && age >= 62 && melange(id, 7) % 3 === 0;
	return (
		<svg
			className="avatar"
			width={size}
			height={size}
			viewBox="0 0 64 64"
			aria-hidden="true"
		>
			<defs>
				<clipPath id={clip}>
					<circle cx="32" cy="32" r="32" />
				</clipPath>
			</defs>
			<g clipPath={`url(#${clip})`}>
				<rect width="64" height="64" fill={choix(FONDS, 5)} />
				{long && (
					<path d="M15 30c0-12 7-19 17-19s17 7 17 19v16H15z" fill={cheveux} />
				)}
				<path d="M8 66c0-13 10-20 24-20s24 7 24 20z" fill={choix(HAUTS, 8)} />
				<rect x="27" y="38" width="10" height="11" rx="4" fill={peau} />
				<circle cx="32" cy="28" r="12" fill={peau} />
				{degarni ? (
					<path
						d="M20 27c0-3 1-6 3-8-1 3-1 6-1 8zM44 27c0-3-1-6-3-8 1 3 1 6 1 8z"
						fill={cheveux}
						stroke={cheveux}
						strokeWidth="2"
					/>
				) : (
					<path
						d={
							long
								? "M19 28c0-9 5-14 13-14s13 5 13 14c-4-1-8-4-10-8-3 4-9 7-16 8z"
								: "M19.5 26c0-8 5-13 12.500-13s12.500 5 12.500 13c-3-3-7-5-12.500-5s-9.500 2-12.500 5z"
						}
						fill={cheveux}
					/>
				)}
			</g>
		</svg>
	);
}
