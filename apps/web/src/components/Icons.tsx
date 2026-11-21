const PATHS = {
	cotisant: (
		<>
			<rect x="3" y="7" width="18" height="13" rx="2" />
			<path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
		</>
	),
	retraite: (
		<path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 7v3M4.5 11.5l2 2M19.5 11.5l-2 2" />
	),
	age: (
		<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
	),
	retour: <path d="M4 12a8 8 0 1 0 2.6-5.900M4 4v4.500h4.500" />,
	eclair: <path d="M13 3L5 13.500h6L10 21l8-10.500h-6z" />,
	population: (
		<>
			<circle cx="9" cy="8" r="3" />
			<path d="M3 20c0-3.300 2.700-6 6-6s6 2.700 6 6M16 5.500a3 3 0 0 1 0 5M17.500 14.500c2 .800 3.500 2.900 3.500 5.500" />
		</>
	),
	attention: <path d="M12 4l9 16H3zM12 10v4.500M12 17.200v.300" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
	return (
		<svg
			className="ic"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			{PATHS[name]}
		</svg>
	);
}
