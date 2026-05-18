import React from "react";
import { Svg, Path, Text, Rect } from "@react-pdf/renderer";
import { arcPath } from "./helpers.js";

const SLICE_COLORS = [
	"#0f766e", // teal
	"#0369a1", // sky
	"#b45309", // amber
	"#7e22ce", // purple
	"#059669", // emerald
	"#dc2626", // red
];

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtMinor = (c) => gbp.format((c ?? 0) / 100);

/**
 * Donut pie chart with right-hand legend. Legend rows have name on the
 * left and "{percent}% · {£amount}" right-aligned. `slices` is
 * `[{ name, value (minor units) }]`. Zero-value slices are dropped.
 */
export function IncomePieChart({ width, height, slices }) {
	const active = slices.filter((s) => s.value > 0);
	if (active.length === 0) {
		return (
			<Svg width={width} height={height}>
				<Text x={width / 2} y={height / 2} style={{ fontSize: 10, color: "#64748b", textAnchor: "middle" }}>
					No income this month
				</Text>
			</Svg>
		);
	}

	const total = active.reduce((s, d) => s + d.value, 0);
	const chartSize = Math.min(width * 0.48, height - 8);
	const cx = chartSize / 2 + 8;
	const cy = height / 2;
	const outerR = chartSize / 2 - 4;
	const innerR = outerR * 0.55;

	let cursor = -Math.PI / 2;
	const segments = active.map((s, i) => {
		const fraction = s.value / total;
		const start = cursor;
		const end = cursor + fraction * Math.PI * 2;
		cursor = end;
		return {
			...s,
			fraction,
			color: SLICE_COLORS[i % SLICE_COLORS.length],
			path: arcPath({ cx, cy, outerRadius: outerR, innerRadius: innerR, startAngle: start, endAngle: end }),
		};
	});

	// Legend block sized to its contents and vertically centred.
	const legendLineH = 18;
	const legendBlockH = segments.length * legendLineH;
	const legendTop = Math.max(8, (height - legendBlockH) / 2);
	const swatchX = chartSize + 24;
	const nameX = swatchX + 16;
	const valueX = width - 8;

	return (
		<Svg width={width} height={height}>
			{segments.map((seg) => (
				<Path key={seg.name} d={seg.path} fill={seg.color} stroke="#ffffff" strokeWidth={1} />
			))}
			{segments.map((seg, i) => {
				const baseY = legendTop + i * legendLineH + 10;
				const pct = Math.round(seg.fraction * 100);
				return (
					<React.Fragment key={`legend-${seg.name}`}>
						<Rect x={swatchX} y={baseY - 8} width={10} height={10} fill={seg.color} />
						<Text x={nameX} y={baseY} style={{ fontSize: 9.5, color: "#0f172a" }}>
							{seg.name}
						</Text>
						<Text
							x={valueX}
							y={baseY}
							style={{
								fontSize: 9.5,
								color: "#0f172a",
								textAnchor: "end",
								fontFamily: "Helvetica-Bold",
							}}
						>
							{`${pct}% · ${fmtMinor(seg.value)}`}
						</Text>
					</React.Fragment>
				);
			})}
		</Svg>
	);
}
