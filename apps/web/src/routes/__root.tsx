import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
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
});

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
