import type { ResultatLeger } from "../engine.worker";
import { entier } from "../format";
import { Histogram } from "./Histogram";
import { Icon } from "./Icons";

/** Les deux histogrammes centraux, avec ou sans photo d'en-tête. */
export function Distributions({
	reference,
	courant,
	compare,
	photos,
}: {
	reference: ResultatLeger | null;
	courant: ResultatLeger | null;
	compare: boolean;
	photos: boolean;
}) {
	return (
		<div className={compare ? "grid" : "grid sans-reference"}>
			<article className="card">
				{photos && (
					<img
						src="/photos/cotisants.jpg"
						alt="Une boulangère surveille la cuisson du pain dans un four professionnel"
						style={{ objectPosition: "50% 55%" }}
					/>
				)}
				<div className="body">
					<h3 style={{ color: "var(--cotisants)" }}>
						<Icon name="cotisant" size={26} />
						Ceux qui cotisent
					</h3>
					<p className="unit">
						Cotisation retraite par an, part salariale et patronale
						{courant && (
							<span className="effectif num">
								, {entier(courant.effectifs.cotisants)} personnes
							</span>
						)}
					</p>
					{courant && reference ? (
						<Histogram
							courant={courant.cotisations.histogramme}
							reference={reference.cotisations.histogramme}
							mediane={courant.cotisations.resume.mediane}
							couleur="var(--cotisants)"
							description="Répartition des cotisations retraite annuelles des salariés du privé"
						/>
					) : (
						<div className="histo attente" />
					)}
				</div>
			</article>
			<article className="card">
				{photos && (
					<img
						src="/photos/retraites.jpg"
						alt="Une femme âgée lance sa boule de pétanque, entourée de deux autres joueurs"
						style={{ objectPosition: "50% 30%" }}
					/>
				)}
				<div className="body">
					<h3 style={{ color: "var(--retraites-text)" }}>
						<Icon name="retraite" size={26} />
						Ceux qui perçoivent
					</h3>
					<p className="unit">
						Pension brute par mois, base et complémentaire
						{courant && (
							<span className="effectif num">
								, {entier(courant.effectifs.retraites)} personnes
							</span>
						)}
					</p>
					{courant && reference ? (
						<Histogram
							courant={courant.pensions.histogramme}
							reference={reference.pensions.histogramme}
							mediane={courant.pensions.resume.mediane}
							couleur="var(--retraites)"
							description="Répartition des pensions mensuelles brutes des retraités du privé"
						/>
					) : (
						<div className="histo attente" />
					)}
				</div>
			</article>
		</div>
	);
}
