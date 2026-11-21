import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces";
import { Icon, type IconName } from "../components/Icons";
import {
	ANNEE_DEFAUT,
	lireAnnee,
	lireReglages,
	type Reglages,
} from "../leviers";
import { ScenarioProvider, useScenario } from "../scenario";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	validateSearch: (
		search: Record<string, unknown>,
	): Reglages & { annee?: number } => {
		const annee = lireAnnee(search);
		return annee === ANNEE_DEFAUT
			? lireReglages(search)
			: { ...lireReglages(search), annee };
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "nos-retraites.app : qui cotise, qui perçoit" },
			{
				name: "description",
				content:
					"Un simulateur citoyen et open source du système de retraite français. Changez une règle, regardez qui cotise et qui perçoit.",
			},
			{ name: "theme-color", content: "#FAF7F2" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32.png",
			},
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		],
	}),
	shellComponent: RootDocument,
	component: Racine,
	notFoundComponent: () => (
		<main className="wrap">
			<h2>Cette page n'existe pas</h2>
			<p className="sub">
				<Link to="/">Revenir à l'accueil</Link>
			</p>
		</main>
	),
});

const PAGES: {
	to: "/scenarios" | "/simuler" | "/decisions" | "/carrieres" | "/modele";
	label: string;
	icone: IconName;
}[] = [
	{ to: "/scenarios", label: "Scénarios", icone: "tableau" },
	{ to: "/simuler", label: "Simuler", icone: "curseurs" },
	{ to: "/decisions", label: "Décisions", icone: "tableau" },
	{ to: "/carrieres", label: "Carrières", icone: "carriere" },
	{ to: "/modele", label: "Modèle", icone: "modele" },
];

function Entete() {
	const { modifies, remplacer } = useScenario();
	return (
		<header className="top">
			<Link to="/" search={(s) => s} className="mark">
				<svg width="26" height="26" viewBox="5 5 22 22" aria-hidden="true">
					<g fill="none" strokeWidth="6" strokeLinecap="round">
						<path
							d="M10 16a6.500 6.500 0 0 1 13 0v7.500"
							stroke="var(--retraites)"
						/>
						<path d="M10 11v12.500" stroke="var(--cotisants)" />
					</g>
				</svg>
				<b>
					nos-retraites<span>.app</span>
				</b>
			</Link>
			<nav aria-label="Pages">
				{PAGES.map((p) => (
					<Link
						key={p.to}
						to={p.to}
						search={(s) => s}
						activeProps={{ className: "actif" }}
					>
						<Icon name={p.icone} size={18} />
						{p.label}
					</Link>
				))}
			</nav>
			{modifies > 0 ? (
				<button
					type="button"
					className="etat-scenario"
					onClick={() => remplacer({})}
					title="Revenir à la loi actuelle"
				>
					<Icon name="retour" size={16} />
					<span className="num">
						{modifies} {modifies > 1 ? "réglages modifiés" : "réglage modifié"}
					</span>
				</button>
			) : (
				<div className="indep">Un projet citoyen, indépendant de l'État</div>
			)}
		</header>
	);
}

function Racine() {
	return (
		<ScenarioProvider>
			<Entete />
			<p className="bandeau">
				<strong>Version de travail.</strong> Les règles de calcul sont celles de
				la loi, mais la population simulée reste approximative : fiez-vous aux
				écarts entre scénarios plus qu'aux montants.{" "}
				<Link to="/modele" search={(s) => s}>
					Ce que le modèle sait faire
				</Link>
			</p>
			<Outlet />
			<footer className="pied">
				<p>
					Ce site n'est pas un service public et ne remplace pas votre relevé de
					carrière. Le code est libre :{" "}
					<a href="https://github.com/waltoss/nos-retraites">
						github.com/waltoss/nos-retraites
					</a>
					.
				</p>
			</footer>
		</ScenarioProvider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="fr">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
