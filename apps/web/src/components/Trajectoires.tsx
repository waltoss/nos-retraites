import type { Projection } from "@nos-retraites/engine";
import { useEffect, useState } from "react";
import { decimal, entier, euros } from "../format";
import { useScenario } from "../scenario";

interface Point {
	x: number;
	y: number;
}

const L = 360;
const H = 170;
const MARGE = { haut: 14, droite: 14, bas: 22, gauche: 14 };

/** Une courbe du scénario, et en pointillé celle de la loi actuelle quand elle diffère. */
function Courbe({
	titre,
	aide,
	reference,
	courant,
	couleur,
	format,
	depuisZero = false,
	anneeEffet,
}: {
	titre: string;
	aide: string;
	reference: Point[];
	courant: Point[];
	couleur: string;
	format: (y: number) => string;
	depuisZero?: boolean;
	anneeEffet: number;
}) {
	const tous = [...reference, ...courant];
	const xs = tous.map((p) => p.x);
	const ys = tous.map((p) => p.y);
	const x0 = Math.min(...xs);
	const x1 = Math.max(...xs);
	let y0 = depuisZero ? Math.min(0, ...ys) : Math.min(...ys);
	let y1 = depuisZero ? Math.max(0, ...ys) : Math.max(...ys);
	const marge = (y1 - y0 || Math.abs(y1) || 1) * 0.12;
	y0 -= depuisZero && y0 === 0 ? 0 : marge;
	y1 += depuisZero && y1 === 0 ? 0 : marge;
	const px = (x: number) =>
		MARGE.gauche + ((x - x0) / (x1 - x0)) * (L - MARGE.gauche - MARGE.droite);
	const py = (y: number) =>
		MARGE.haut + (1 - (y - y0) / (y1 - y0)) * (H - MARGE.haut - MARGE.bas);
	const trace = (points: Point[]) =>
		points
			.map(
				(p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`,
			)
			.join(" ");
	const differe = courant.some(
		(p, i) => Math.abs(p.y - (reference[i]?.y ?? p.y)) > 1e-9,
	);
	const debut = courant[0] as Point;
	const fin = courant[courant.length - 1] as Point;
	const finReference = reference[reference.length - 1] as Point;
	return (
		<figure className="courbe">
			<figcaption>
				<strong>{titre}</strong>
				<small>{aide}</small>
			</figcaption>
			<svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={titre}>
				{depuisZero && (
					<line
						x1={MARGE.gauche}
						x2={L - MARGE.droite}
						y1={py(0)}
						y2={py(0)}
						className="zero"
					/>
				)}
				<line
					x1={px(anneeEffet)}
					x2={px(anneeEffet)}
					y1={MARGE.haut}
					y2={H - MARGE.bas}
					className="effet"
				/>
				{differe && <path d={trace(reference)} className="reference" />}
				<path d={trace(courant)} stroke={couleur} className="scenario" />
				<circle cx={px(fin.x)} cy={py(fin.y)} r="3.5" fill={couleur} />
				<text x={MARGE.gauche} y={H - 5} className="axe">
					{x0}
				</text>
				{px(anneeEffet) - MARGE.gauche > 48 && (
					<text
						x={px(anneeEffet)}
						y={H - 5}
						className="axe"
						textAnchor="middle"
					>
						{anneeEffet}
					</text>
				)}
				<text x={L - MARGE.droite} y={H - 5} className="axe" textAnchor="end">
					{x1}
				</text>
			</svg>
			<p className="num">
				{format(debut.y)} en {debut.x}, <strong>{format(fin.y)}</strong> en{" "}
				{fin.x}
				{differe && (
					<em> contre {format(finReference.y)} avec la loi actuelle</em>
				)}
			</p>
		</figure>
	);
}

const milliards = (y: number) =>
	`${y > 0 ? "+" : y < 0 ? "−" : ""}${entier(Math.abs(y))} milliards`;

/** Les trajectoires du système de 2026 à 2070, loi actuelle et scénario. */
export function Trajectoires() {
	const { pret, demander, scenario, modifies } = useScenario();
	const [donnees, setDonnees] = useState<{
		reference: Projection;
		courant: Projection;
		anneeEffet: number;
	} | null>(null);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		const t = setTimeout(() => {
			demander({ type: "projection", scenario }).then((r) => {
				if (actif)
					setDonnees({
						reference: r.reference,
						courant: r.courant,
						anneeEffet: r.anneeEffet,
					});
			});
		}, 200);
		return () => {
			actif = false;
			clearTimeout(t);
		};
	}, [pret, demander, scenario]);

	if (!donnees)
		return <div className="histo attente" style={{ height: 420 }} />;
	const { reference, courant, anneeEffet } = donnees;
	const serie = (
		p: Projection,
		f: (a: Projection["annees"][number]) => number,
	) => p.annees.map((a) => ({ x: a.annee, y: f(a) }));
	// Ce que le scénario change à l'équilibre, année par année : cotisations en plus, pensions en moins.
	const effet = courant.annees.map((a, i) => {
		const r = reference.annees[i] as Projection["annees"][number];
		return {
			x: a.annee,
			y: (a.cotisations - r.cotisations - (a.pensions - r.pensions)) / 1e9,
		};
	});
	const cumul = effet.reduce((t, p) => t + p.y, 0);
	// Moyenne glissante sur cinq générations : chacune ne compte que quelques centaines de personnes simulées.
	const generations = (p: Projection) =>
		p.generations
			.map((g, i, toutes) => {
				const voisines = toutes.slice(Math.max(0, i - 2), i + 3);
				const moyenne = (f: (x: typeof g) => number) =>
					voisines.reduce((t, x) => t + f(x), 0) / voisines.length;
				return {
					generation: g.generation,
					ageMoyenDepart: moyenne((x) => x.ageMoyenDepart),
					pensionMoyenne: moyenne((x) => x.pensionMoyenne),
				};
			})
			.filter((g) => g.generation >= 1960 && g.generation <= 2005);
	const communs = { anneeEffet };
	return (
		<>
			<div className="courbes">
				<Courbe
					{...communs}
					titre="Cotisants pour un retraité"
					aide="Moins il y en a, plus chaque cotisant porte de pensions."
					reference={serie(reference, (a) => a.cotisants / a.retraites)}
					courant={serie(courant, (a) => a.cotisants / a.retraites)}
					couleur="var(--cotisants)"
					format={(y) =>
						decimal(Math.round(y * 100) / 100).replace(/,(\d)$/, ",$1")
					}
				/>
				<Courbe
					{...communs}
					titre="Pensions pour 100 euros de cotisations"
					aide="Au-dessus de 100, les cotisations ne suffisent pas : le reste vient d'autres ressources."
					reference={serie(
						reference,
						(a) => (a.pensions / a.cotisations) * 100,
					)}
					courant={serie(courant, (a) => (a.pensions / a.cotisations) * 100)}
					couleur="var(--besoin)"
					format={(y) => `${entier(y)} €`}
				/>
				<Courbe
					{...communs}
					titre="Pension moyenne, en part du salaire moyen"
					aide="Le niveau de vie des retraités par rapport à ceux qui travaillent."
					reference={serie(
						reference,
						(a) => ((a.pensionMoyenne * 12) / a.salaireMoyen) * 100,
					)}
					courant={serie(
						courant,
						(a) => ((a.pensionMoyenne * 12) / a.salaireMoyen) * 100,
					)}
					couleur="var(--retraites)"
					format={(y) => `${entier(y)} %`}
				/>
				<Courbe
					{...communs}
					titre="Âge moyen de ceux qui partent dans l'année"
					aide="L'âge auquel on quitte réellement le travail pour la retraite."
					reference={serie(reference, (a) => a.ageMoyenDepart)}
					courant={serie(courant, (a) => a.ageMoyenDepart)}
					couleur="var(--ink)"
					format={(y) => `${decimal(y)} ans`}
				/>
			</div>

			{modifies > 0 && (
				<div className="courbes deux">
					<Courbe
						{...communs}
						titre="Ce que votre scénario change à l'équilibre, chaque année"
						aide="Cotisations en plus et pensions en moins, en milliards d'euros de 2026. Au-dessus de zéro, le système a besoin de moins d'argent."
						reference={effet.map((p) => ({ x: p.x, y: 0 }))}
						courant={effet}
						couleur={cumul >= 0 ? "var(--cotisants)" : "var(--besoin)"}
						format={milliards}
						depuisZero
					/>
					<div className="cumul">
						<small>
							Cumul de {anneeEffet} à {courant.annees.at(-1)?.annee}
						</small>
						<strong className={cumul >= 0 ? "num mieux" : "num pire"}>
							{milliards(cumul)}
						</strong>
						<p>
							{cumul >= 0
								? "C'est autant de dette en moins à lever, ou d'autres ressources à ne pas chercher, d'ici 2070."
								: "C'est autant à trouver d'ici 2070 : dette, impôts, cotisations ou économies ailleurs."}{" "}
							En euros de 2026, sans intérêts.
						</p>
					</div>
				</div>
			)}

			<h3>Génération par génération</h3>
			<p className="sub">
				Ce que chaque génération peut attendre, selon son année de naissance.
				Les plus jeunes partiront après 2060.
			</p>
			<div className="courbes deux">
				<Courbe
					anneeEffet={anneeEffet - 62}
					titre="Âge moyen de départ"
					aide="Par année de naissance."
					reference={generations(reference).map((g) => ({
						x: g.generation,
						y: g.ageMoyenDepart,
					}))}
					courant={generations(courant).map((g) => ({
						x: g.generation,
						y: g.ageMoyenDepart,
					}))}
					couleur="var(--ink)"
					format={(y) => `${decimal(y)} ans`}
				/>
				<Courbe
					anneeEffet={anneeEffet - 62}
					titre="Pension moyenne au moment du départ"
					aide="Par année de naissance, en euros de 2026 par mois."
					reference={generations(reference).map((g) => ({
						x: g.generation,
						y: g.pensionMoyenne,
					}))}
					courant={generations(courant).map((g) => ({
						x: g.generation,
						y: g.pensionMoyenne,
					}))}
					couleur="var(--retraites)"
					format={(y) => euros(y)}
				/>
			</div>
		</>
	);
}
