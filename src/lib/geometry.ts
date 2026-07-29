/**
 * Shared 2D primitives. Everything downstream of `text.ts` works in
 * "toolpath space": millimetres, X right, **Y up**, origin at machine zero.
 */

export type Pt = { x: number; y: number };

/**
 * A closed polygon. Winding carries meaning: glyph outers and their counters
 * (the hole in an `o`) wind opposite ways, and clipper's non-zero fill rule
 * relies on that to keep counters open.
 */
export type Contour = Pt[];

export const distance = (a: Pt, b: Pt): number =>
	Math.hypot(b.x - a.x, b.y - a.y);

export type Bounds = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
};

export const EMPTY_BOUNDS: Bounds = {
	minX: Number.POSITIVE_INFINITY,
	minY: Number.POSITIVE_INFINITY,
	maxX: Number.NEGATIVE_INFINITY,
	maxY: Number.NEGATIVE_INFINITY,
};

export const boundsOf = (contours: Contour[]): Bounds => {
	const b = { ...EMPTY_BOUNDS };
	for (const contour of contours) {
		for (const p of contour) {
			if (p.x < b.minX) b.minX = p.x;
			if (p.y < b.minY) b.minY = p.y;
			if (p.x > b.maxX) b.maxX = p.x;
			if (p.y > b.maxY) b.maxY = p.y;
		}
	}
	return b;
};

export const isEmptyBounds = (b: Bounds): boolean => b.minX > b.maxX;

export const boundsSize = (b: Bounds): { width: number; height: number } =>
	isEmptyBounds(b)
		? { width: 0, height: 0 }
		: { width: b.maxX - b.minX, height: b.maxY - b.minY };

export const translateContours = (
	contours: Contour[],
	dx: number,
	dy: number,
): Contour[] =>
	contours.map((c) => c.map((p) => ({ x: p.x + dx, y: p.y + dy })));

/** Signed area; positive means counter-clockwise in a Y-up frame. */
export const signedArea = (contour: Contour): number => {
	let sum = 0;
	for (let i = 0; i < contour.length; i += 1) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
};

/** Total length of the closed contour, including the closing segment. */
export const perimeter = (contour: Contour): number => {
	let total = 0;
	for (let i = 0; i < contour.length; i += 1) {
		total += distance(contour[i], contour[(i + 1) % contour.length]);
	}
	return total;
};

/**
 * Cumulative arc length at each vertex, plus the total. `lengths[i]` is the
 * distance from vertex 0 to vertex i along the contour; the array has one extra
 * entry for the wrap back to the start. Used for tab placement.
 */
export const arcLengths = (
	contour: Contour,
): { lengths: number[]; total: number } => {
	const lengths: number[] = [0];
	let acc = 0;
	for (let i = 0; i < contour.length; i += 1) {
		acc += distance(contour[i], contour[(i + 1) % contour.length]);
		lengths.push(acc);
	}
	return { lengths, total: acc };
};

/** Point at arc-length `s` around a closed contour (wraps). */
export const pointAtArcLength = (
	contour: Contour,
	lengths: number[],
	total: number,
	s: number,
): Pt => {
	if (total <= 0) return contour[0];
	let target = s % total;
	if (target < 0) target += total;

	// lengths is monotonic, so a linear scan is fine at our vertex counts.
	for (let i = 0; i < contour.length; i += 1) {
		const segStart = lengths[i];
		const segEnd = lengths[i + 1];
		if (target <= segEnd) {
			const segLen = segEnd - segStart;
			const t = segLen > 0 ? (target - segStart) / segLen : 0;
			const a = contour[i];
			const b = contour[(i + 1) % contour.length];
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		}
	}
	return contour[0];
};

/**
 * The largest contour in a set, by perimeter.
 *
 * Offsetting any of our blank shapes outward yields exactly one contour, so in
 * practice this just picks it. Choosing one explicitly rather than spreading
 * tabs across every contour keeps tab indices unambiguous — which matters the
 * moment a drag has to say *which* tab it grabbed.
 */
export const primaryContour = (contours: Contour[]): Contour | null =>
	contours.length === 0
		? null
		: contours.reduce((best, c) => (perimeter(c) > perimeter(best) ? c : best));

/**
 * Nearest point on a closed contour to `p`, with where it falls along the
 * perimeter. This is what turns a pointer position into a tab position: the
 * user drags anywhere near the profile and the tab slides along it.
 */
export const closestPointOnContour = (
	contour: Contour,
	p: Pt,
): { fraction: number; arcLength: number; point: Pt; distance: number } | null => {
	if (contour.length < 2) return null;

	const { lengths, total } = arcLengths(contour);
	if (total <= 0) return null;

	let best = {
		fraction: 0,
		arcLength: 0,
		point: contour[0],
		distance: Number.POSITIVE_INFINITY,
	};

	for (let i = 0; i < contour.length; i += 1) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lenSq = dx * dx + dy * dy;

		// Clamping t to [0,1] keeps the projection on the segment, so a point
		// off the end of one edge lands on its corner rather than out in space.
		const t =
			lenSq === 0
				? 0
				: Math.max(
						0,
						Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
					);

		const point = { x: a.x + dx * t, y: a.y + dy * t };
		const distance = Math.hypot(p.x - point.x, p.y - point.y);
		if (distance < best.distance) {
			const arcLength = lengths[i] + t * Math.sqrt(lenSq);
			best = { fraction: arcLength / total, arcLength, point, distance };
		}
	}

	return best;
};

/** Drop consecutive duplicate points, and the closing point if it repeats. */
export const dedupe = (contour: Contour, epsilon = 1e-6): Contour => {
	const out: Contour = [];
	for (const p of contour) {
		const last = out[out.length - 1];
		if (!last || Math.abs(last.x - p.x) > epsilon || Math.abs(last.y - p.y) > epsilon) {
			out.push(p);
		}
	}
	while (
		out.length > 1 &&
		Math.abs(out[0].x - out[out.length - 1].x) <= epsilon &&
		Math.abs(out[0].y - out[out.length - 1].y) <= epsilon
	) {
		out.pop();
	}
	return out;
};

/** SVG path data for a set of closed contours, for canvas rendering. */
export const contoursToPathData = (contours: Contour[], decimals = 3): string =>
	contours
		.filter((c) => c.length > 1)
		.map((c) => {
			const pts = c.map(
				(p) => `${p.x.toFixed(decimals)} ${p.y.toFixed(decimals)}`,
			);
			return `M${pts[0]}L${pts.slice(1).join("L")}Z`;
		})
		.join("");
