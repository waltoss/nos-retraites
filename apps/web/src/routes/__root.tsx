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
import { lireReglages } from "../leviers";
import { ScenarioProvider, useScenario } from "../scenario";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	validateSearch: (search: Record<string, unknown>) => lireReglages(search),
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
		links: [{ rel: "stylesheet", href: appCss }],
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
	to: "/simuler" | "/decisions" | "/carrieres" | "/modele";
	label: string;
	icone: IconName;
}[] = [
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
				nos-retraites<span>.app</span>
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
