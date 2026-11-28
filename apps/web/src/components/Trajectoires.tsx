import {
	type AnneeSysteme,
	PATRIMOINE_SYSTEME,
	type Projection,
} from "@nos-retraites/engine";
import { type PointerEvent, type ReactNode, useEffect, useState } from "react";
import { decimal, entier, euros } from "../format";
import { type Lecture, soldeLu } from "../lecture";
import { useScenario } from "../scenario";
import { cadrer } from "./Histogram";
import { Icon } from "./Icons";
import { Info } from "./Info";

interface Point {
	x: number;
	y: number;
}

const L = 360;
const H = 170;
const MARGE = { haut: 14, droite: 14, bas: 22, gauche: 14 };

/** Une courbe du scénario, et en pointillé celle de la loi actuelle quand elle diffère. */
export function Courbe({
	titre,
	aide,
	reference,
	courant,
	couleur,
	format,
	depuisZero = false,
	anneeEffet,
	enTete = "En",
	sansReference = false,
}: {
	titre: string;
	aide: string;
	reference: Point[];
	courant: Point[];
	couleur: string;
	format: (y: number) => string;
	depuisZero?: boolean;
	anneeEffet: number;
	/** Mot qui précède l'abscisse dans la bulle : « En 2045 », « Nés en 1975 ». */
	enTete?: string;
	/** La courbe est déjà un écart à la loi actuelle : inutile de la rappeler. */
	sansReference?: boolean;
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
	const differe =
		!sansReference &&
		courant.some((p, i) => Math.abs(p.y - (reference[i]?.y ?? p.y)) > 1e-9);
	const [survol, setSurvol] = useState<number | null>(null);
	const viser = (e: PointerEvent<SVGSVGElement>) => {
		const cadre = e.currentTarget.getBoundingClientRect();
		const x =
			x0 +
			((((e.clientX - cadre.left) / cadre.width) * L - MARGE.gauche) /
				(L - MARGE.gauche - MARGE.droite)) *
				(x1 - x0);
		let proche = 0;
		courant.forEach((p, i) => {
			if (Math.abs(p.x - x) < Math.abs((courant[proche] as Point).x - x))
				proche = i;
		});
		setSurvol(proche);
	};
	const vise = survol === null ? null : (courant[survol] as Point);
	const viseReference = survol === null ? null : reference[survol];
	const debut = courant[0] as Point;
	const fin = courant[courant.length - 1] as Point;
	const finReference = reference[reference.length - 1] as Point;
	return (
		<figure className="courbe">
			<figcaption>
				<strong>{titre}</strong>
				<small>{aide}</small>
			</figcaption>
			<div className="trace">
				<svg
					viewBox={`0 0 ${L} ${H}`}
					role="img"
					aria-label={titre}
					onPointerMove={viser}
					onPointerDown={viser}
					onPointerLeave={() => setSurvol(null)}
				>
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
					{vise && (
						<g className="vise">
							<line
								x1={px(vise.x)}
								x2={px(vise.x)}
								y1={MARGE.haut}
								y2={H - MARGE.bas}
							/>
							{differe && viseReference && (
								<circle cx={px(vise.x)} cy={py(viseReference.y)} r="3" />
							)}
							<circle
								cx={px(vise.x)}
								cy={py(vise.y)}
								r="4.5"
								fill={couleur}
								className="point"
							/>
						</g>
					)}
				</svg>
				{vise && (
					<div
						className="bulle num"
						style={{
							left: cadrer((px(vise.x) / L) * 100),
							bottom: `calc(${(1 - py(vise.y) / H) * 100}% + 12px)`,
						}}
					>
						<strong>
							{enTete} {vise.x} : {format(vise.y)}
						</strong>
						{differe &&
							viseReference &&
							Math.abs(viseReference.y - vise.y) > 1e-9 && (
								<span className="avant">
									{format(viseReference.y)} avec la loi actuelle
								</span>
							)}
					</div>
				)}
			</div>
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

/** Un total sur la période : ce qu'il faut trouver, ou l'excédent. */
const total = (md: number) =>
	md >= 0 ? `${entier(md)} Md€ d'excédent` : `${entier(-md)} Md€`;

/** Réserves moins dette de fin 2025, en milliards d'euros de 2026. */
const PATRIMOINE_DEPART =
	(PATRIMOINE_SYSTEME.reserves - PATRIMOINE_SYSTEME.dette) / 1e9;

/** Un choix à deux positions de la lecture du solde. */
function Choix({
	legende,
	actif,
	sans,
	avec,
	onChoix,
	children,
}: {
	legende: string;
	actif: boolean;
	sans: string;
	avec: string;
	onChoix: (actif: boolean) => void;
	children?: ReactNode;
}) {
	return (
		<fieldset className="choix-annee">
			<legend>{legende}</legend>
			<button
				type="button"
				className={actif ? "puce" : "puce actif"}
				aria-pressed={!actif}
				onClick={() => onChoix(false)}
			>
				{sans}
			</button>
			<button
				type="button"
				className={actif ? "puce actif" : "puce"}
				aria-pressed={actif}
				onClick={() => onChoix(true)}
			>
				{avec}
			</button>
			{children}
		</fieldset>
	);
}

/** Les trajectoires du système de 2026 à 2070, loi actuelle et scénario. */
export function Trajectoires({
	lecture,
	onLecture,
}: {
	lecture: Lecture;
	onLecture: (l: Lecture) => void;
}) {
	const { pret, demander, scenario, modifies } = useScenario();
	const [donnees, setDonnees] = useState<{
		reference: Projection;
		courant: Projection;
		systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
		anneeEffet: number;
	} | null>(null);
	const { horsEtat } = lecture;

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		const t = setTimeout(() => {
			demander({ type: "projection", scenario }).then((r) => {
				if (actif)
					setDonnees({
						reference: r.reference,
						courant: r.courant,
						systeme: r.systeme,
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
	const { reference, courant, systeme, anneeEffet } = donnees;
	const serie = (
		p: Projection,
		f: (a: Projection["annees"][number]) => number,
	) => p.annees.map((a) => ({ x: a.annee, y: f(a) }));
	// Solde du système entier, selon que les versements d'équilibre de l'État comptent ou non comme
	// une ressource, et que les intérêts des réserves et de la dette y entrent ou non.
	const solde = (a: AnneeSysteme) => soldeLu(a, lecture);
	const soldes = (annees: AnneeSysteme[]) =>
		annees.map((a) => ({ x: a.annee, y: solde(a) / 1e9 }));
	const cumul = (annees: AnneeSysteme[]) =>
		annees.reduce((t, a) => t + solde(a), 0) / 1e9;
	const cumulReference = cumul(systeme.reference);
	const cumulCourant = cumul(systeme.courant);
	const derniere = systeme.courant.at(-1)?.annee ?? 2070;
	const situationFinale = (annees: AnneeSysteme[]) => {
		const s = annees.at(-1)?.situationPatrimoniale;
		return s ? (horsEtat ? s.horsEtat : s.officiel) / 1e9 : 0;
	};
	const finale = situationFinale(
		modifies > 0 ? systeme.courant : systeme.reference,
	);
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
			<div className="solde" id="solde">
				<div className="solde-tete">
					<h3>Solde des retraites, tous régimes</h3>
					<div className="solde-lectures">
						<Choix
							legende="Lecture"
							actif={horsEtat}
							sans="Officielle"
							avec="Sans versements de l'État"
							onChoix={(v) => onLecture({ ...lecture, horsEtat: v })}
						>
							<Info label="Ce que changent les versements de l'État">
								<strong>Officielle</strong> : la lecture du Conseil
								d'orientation des retraites. Les sommes que l'État verse pour
								équilibrer les retraites de ses propres agents comptent comme
								une ressource.
								<br />
								<strong>Sans versements de l'État</strong> : elles ne comptent
								pas. Certains y voient le vrai déficit, d'autres une simple
								cotisation d'employeur plus élevée qu'ailleurs.
							</Info>
						</Choix>
						<Choix
							legende="Intérêts"
							actif={lecture.interets}
							sans="Sans"
							avec="Avec"
							onChoix={(v) => onLecture({ ...lecture, interets: v })}
						>
							<Info label="Ce que changent les intérêts">
								<strong>Avec</strong> : les réserves des caisses rapportent, la
								dette coûte, et chaque déficit creuse la dette. Taux : la hausse
								du salaire moyen au-dessus des prix (0,7 % à terme), comme le
								COR.
								<br />
								<strong>Sans</strong> : la convention du COR.
							</Info>
						</Choix>
					</div>
				</div>
				<div className="courbes deux">
					<Courbe
						{...communs}
						titre="Ressources moins dépenses, chaque année"
						aide="En milliards d'euros de 2026. Sous zéro, il manque de l'argent."
						reference={soldes(systeme.reference)}
						courant={soldes(systeme.courant)}
						couleur="var(--besoin)"
						format={milliards}
						depuisZero
					/>
					<div className="cumul">
						<div className="cumul-tete">
							<small>
								À trouver de {systeme.courant[0]?.annee} à {derniere}
							</small>
							<Info label="Ce que compte ce total">
								{lecture.interets ? (
									<>
										Somme des soldes annuels, intérêts compris, en euros de
										2026. Les réserves dépassaient la dette de{" "}
										{entier(PATRIMOINE_DEPART)} milliards fin 2025 ; en{" "}
										{derniere}
										{modifies > 0 ? ", avec votre scénario," : ""}{" "}
										{finale >= 0
											? `elles la dépasseraient de ${entier(finale)} milliards.`
											: `la dette dépasserait les réserves de ${entier(Math.abs(finale))} milliards.`}
									</>
								) : (
									"Somme des soldes annuels, en euros de 2026 et sans intérêts : dette à lever, impôts, cotisations ou économies ailleurs."
								)}
							</Info>
						</div>
						<div className="cumul-chiffres">
							<div>
								<small>
									<Icon name="loi" size={16} />
									Loi actuelle
								</small>
								<strong className="num">{total(cumulReference)}</strong>
							</div>
							{modifies > 0 && Math.abs(cumulCourant - cumulReference) >= 1 && (
								<div>
									<small>
										<Icon name="curseurs" size={16} />
										Votre scénario
									</small>
									<strong
										className={
											cumulCourant >= cumulReference ? "num mieux" : "num pire"
										}
									>
										{total(cumulCourant)}
									</strong>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<h3>Ce qui se passe chez les salariés du privé</h3>
			<div className="courbes">
				<Courbe
					{...communs}
					titre="Cotisants pour un retraité"
					aide="Moins il y en a, plus chaque cotisant porte de pensions."
					reference={serie(reference, (a) => a.cotisants / a.retraites)}
					courant={serie(courant, (a) => a.cotisants / a.retraites)}
					couleur="var(--cotisants)"
					format={(y) =>
						y.toLocaleString("fr-FR", {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})
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

			<h3>Génération par génération</h3>
			<p className="sub">
				Ce que chaque génération peut attendre, selon son année de naissance.
				Les plus jeunes partiront après 2060.
			</p>
			<div className="courbes deux">
				<Courbe
					anneeEffet={anneeEffet - 62}
					enTete="Nés en"
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
					enTete="Nés en"
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
