/**
 * Linear scale: maps a [domainMin, domainMax] input to a [rangeMin, rangeMax]
 * output. Defensive against zero-range domains so chart axes don't blow up
 * when the data is all the same value.
 */
export function makeLinearScale(domainMin, domainMax, rangeMin, rangeMax) {
	if (domainMin === domainMax) {
		const mid = (rangeMin + rangeMax) / 2;
		return () => mid;
	}
	const slope = (rangeMax - rangeMin) / (domainMax - domainMin);
	return (v) => rangeMin + (v - domainMin) * slope;
}

/**
 * Format a minor-unit value (pence) as a compact GBP string suitable for
 * tight chart axes: "£1.2k", "£45.30", "−£800".
 */
export function compactGbp(minor) {
	const v = (minor ?? 0) / 100;
	const abs = Math.abs(v);
	const sign = v < 0 ? "−" : "";
	if (abs >= 1000) {
		const k = v / 1000;
		const text = Math.abs(k) >= 10
			? `${sign}£${Math.round(Math.abs(k))}k`
			: `${sign}£${Math.abs(k).toFixed(1).replace(/\.0$/, "")}k`;
		return text;
	}
	return `${sign}£${abs.toFixed(0)}`;
}

/**
 * Pick "nice" tick values across [min, max]. Targets `count` ticks but
 * may return slightly fewer.
 */
export function niceTicks(min, max, count = 5) {
	if (min === max) return [min];
	const step = niceStep((max - min) / count);
	const start = Math.ceil(min / step) * step;
	const ticks = [];
	for (let v = start; v <= max + step / 2; v += step) {
		ticks.push(v);
	}
	return ticks;
}

function niceStep(raw) {
	const exp = Math.floor(Math.log10(raw));
	const base = Math.pow(10, exp);
	const f = raw / base;
	let mult;
	if (f < 1.5) mult = 1;
	else if (f < 3) mult = 2;
	else if (f < 7) mult = 5;
	else mult = 10;
	return mult * base;
}

/**
 * Generate an SVG path for a pie/donut slice. Angles are radians,
 * measured clockwise from -π/2 (12 o'clock).
 */
export function arcPath({ cx, cy, outerRadius, innerRadius = 0, startAngle, endAngle }) {
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	const cosS = Math.cos(startAngle);
	const sinS = Math.sin(startAngle);
	const cosE = Math.cos(endAngle);
	const sinE = Math.sin(endAngle);
	const x1 = cx + outerRadius * cosS;
	const y1 = cy + outerRadius * sinS;
	const x2 = cx + outerRadius * cosE;
	const y2 = cy + outerRadius * sinE;
	if (innerRadius <= 0) {
		return `M ${cx} ${cy} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
	}
	const ix1 = cx + innerRadius * cosS;
	const iy1 = cy + innerRadius * sinS;
	const ix2 = cx + innerRadius * cosE;
	const iy2 = cy + innerRadius * sinE;
	return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
}

/**
 * Generate an SVG polyline points string for a set of (x, y) pairs.
 */
export function polylinePoints(points) {
	return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/**
 * Generate an SVG area path (line + close down to baseline).
 */
export function areaPath(points, baselineY) {
	if (points.length === 0) return "";
	const [x0, y0] = points[0];
	const segs = points.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`);
	const [xN] = points[points.length - 1];
	return `M ${x0.toFixed(2)} ${y0.toFixed(2)} ${segs.join(" ")} L ${xN.toFixed(2)} ${baselineY} L ${x0.toFixed(2)} ${baselineY} Z`;
}
