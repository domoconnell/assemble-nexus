import React from "react";
import { Svg, Path, Line, Text, Polyline } from "@react-pdf/renderer";
import {
	makeLinearScale,
	niceTicks,
	compactGbp,
	areaPath,
	polylinePoints,
} from "./helpers.js";

const dateLabelFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const monthLabelFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

/**
 * Time-series line + area chart rendered as @react-pdf SVG primitives.
 *
 * `points` is `[{ x: Date | number | string, y: number }]`. `x` values
 * are spaced evenly along the chart's width (we don't bother with a
 * time scale because both consuming charts have evenly-spaced buckets).
 *
 * `stroke` and `fill` control the line + area colours; pass null to
 * `fill` to skip the area.
 */
export function LineChart({
	width,
	height,
	points,
	stroke = "#0f766e",
	fill = "#0f766e22",
	xLabelEvery = 1,
	xLabelFormatter,
	margins = { top: 12, right: 16, bottom: 28, left: 48 },
	yLabelFormatter = compactGbp,
}) {
	if (!points || points.length === 0) {
		return (
			<Svg width={width} height={height}>
				<Text x={width / 2} y={height / 2} style={{ fontSize: 10, color: "#64748b" }}>
					No data
				</Text>
			</Svg>
		);
	}

	const plotW = width - margins.left - margins.right;
	const plotH = height - margins.top - margins.bottom;
	const minY = Math.min(0, ...points.map((p) => p.y));
	const maxY = Math.max(0, ...points.map((p) => p.y));
	const padY = (maxY - minY) * 0.1 || 1;
	const yMin = minY - (minY < 0 ? padY : 0);
	const yMax = maxY + padY;
	const xScale = makeLinearScale(0, Math.max(1, points.length - 1), margins.left, margins.left + plotW);
	const yScale = makeLinearScale(yMin, yMax, margins.top + plotH, margins.top);
	const baseline = yScale(Math.max(0, yMin));

	const xy = points.map((p, i) => [xScale(i), yScale(p.y)]);
	const yTicks = niceTicks(yMin, yMax, 4);
	const xLabels = points
		.map((p, i) => ({ i, x: xScale(i), label: p.x }))
		.filter((_, i) => i % xLabelEvery === 0 || i === points.length - 1);

	const fmt = xLabelFormatter || ((v) => String(v));

	return (
		<Svg width={width} height={height}>
			{/* Y gridlines + labels */}
			{yTicks.map((t) => {
				const y = yScale(t);
				return (
					<React.Fragment key={`y-${t}`}>
						<Line
							x1={margins.left}
							x2={margins.left + plotW}
							y1={y}
							y2={y}
							stroke="#e2e8f0"
							strokeWidth={0.5}
							strokeDasharray="2 2"
						/>
						<Text
							x={margins.left - 6}
							y={y + 3}
							style={{ fontSize: 8, color: "#64748b", textAnchor: "end" }}
						>
							{yLabelFormatter(t)}
						</Text>
					</React.Fragment>
				);
			})}

			{/* Baseline (zero) emphasised */}
			<Line
				x1={margins.left}
				x2={margins.left + plotW}
				y1={baseline}
				y2={baseline}
				stroke="#94a3b8"
				strokeWidth={0.7}
			/>

			{/* Area fill */}
			{fill && (
				<Path d={areaPath(xy, baseline)} fill={fill} />
			)}

			{/* Line */}
			<Polyline points={polylinePoints(xy)} stroke={stroke} strokeWidth={1.4} fill="none" />

			{/* X labels */}
			{xLabels.map(({ i, x, label }) => (
				<Text
					key={`x-${i}`}
					x={x}
					y={margins.top + plotH + 14}
					style={{ fontSize: 8, color: "#64748b", textAnchor: "middle" }}
				>
					{fmt(label)}
				</Text>
			))}
		</Svg>
	);
}

export function BankBalanceLineChart({ width, height, daily }) {
	const points = daily.map((d) => ({
		x: new Date(d.bucket_start),
		y: Number(d.cleared_minor) || 0,
	}));
	const every = Math.max(1, Math.floor(points.length / 6));
	return (
		<LineChart
			width={width}
			height={height}
			points={points}
			xLabelEvery={every}
			xLabelFormatter={(d) => dateLabelFmt.format(d)}
		/>
	);
}

/**
 * 12-month income vs costs trend. Two lines: green for income, red for
 * cost of business + cost of building (everything the venue's tracking).
 */
export function PnlTrendChart({ width, height, months }) {
	if (!months || months.length === 0) {
		return (
			<Svg width={width} height={height}>
				<Text x={width / 2} y={height / 2} style={{ fontSize: 10, color: "#64748b" }}>
					No history
				</Text>
			</Svg>
		);
	}
	const margins = { top: 36, right: 16, bottom: 30, left: 52 };
	const plotW = width - margins.left - margins.right;
	const plotH = height - margins.top - margins.bottom;
	const totalCosts = months.map((m) => (m.cost_of_business ?? 0) + (m.cost_of_building ?? 0));
	const allY = months.flatMap((m, i) => [m.income.total, totalCosts[i]]);
	const minY = Math.min(0, ...allY);
	const maxY = Math.max(0, ...allY);
	const padY = (maxY - minY) * 0.1 || 1;
	const yMin = minY - (minY < 0 ? padY : 0);
	const yMax = maxY + padY;
	const xScale = makeLinearScale(0, Math.max(1, months.length - 1), margins.left, margins.left + plotW);
	const yScale = makeLinearScale(yMin, yMax, margins.top + plotH, margins.top);
	const baseline = yScale(Math.max(0, yMin));
	const yTicks = niceTicks(yMin, yMax, 4);

	const incomePts = months.map((m, i) => [xScale(i), yScale(m.income.total)]);
	const costPts = months.map((m, i) => [xScale(i), yScale(totalCosts[i])]);

	return (
		<Svg width={width} height={height}>
			{yTicks.map((t) => {
				const y = yScale(t);
				return (
					<React.Fragment key={`y-${t}`}>
						<Line
							x1={margins.left}
							x2={margins.left + plotW}
							y1={y}
							y2={y}
							stroke="#e2e8f0"
							strokeWidth={0.5}
							strokeDasharray="2 2"
						/>
						<Text
							x={margins.left - 6}
							y={y + 3}
							style={{ fontSize: 8, color: "#64748b", textAnchor: "end" }}
						>
							{compactGbp(t)}
						</Text>
					</React.Fragment>
				);
			})}
			<Line
				x1={margins.left}
				x2={margins.left + plotW}
				y1={baseline}
				y2={baseline}
				stroke="#94a3b8"
				strokeWidth={0.7}
			/>
			<Polyline points={polylinePoints(incomePts)} stroke="#0f766e" strokeWidth={1.4} fill="none" />
			<Polyline points={polylinePoints(costPts)} stroke="#b91c1c" strokeWidth={1.4} fill="none" />

			{months.map((m, i) => {
				const x = xScale(i);
				const [year, mo] = m.ym.split("-").map(Number);
				const label = monthLabelFmt.format(new Date(Date.UTC(year, mo - 1, 1)));
				if (i % Math.max(1, Math.floor(months.length / 6)) !== 0 && i !== months.length - 1) return null;
				return (
					<Text
						key={`x-${m.ym}`}
						x={x}
						y={margins.top + plotH + 14}
						style={{ fontSize: 8, color: "#64748b", textAnchor: "middle" }}
					>
						{label}
					</Text>
				);
			})}

			{/* Legend - sat in its own band above the plot */}
			<Line
				x1={margins.left}
				x2={margins.left + 14}
				y1={14}
				y2={14}
				stroke="#0f766e"
				strokeWidth={1.4}
			/>
			<Text
				x={margins.left + 18}
				y={17}
				style={{ fontSize: 9, color: "#0f172a" }}
			>
				Income
			</Text>
			<Line
				x1={margins.left + 80}
				x2={margins.left + 94}
				y1={14}
				y2={14}
				stroke="#b91c1c"
				strokeWidth={1.4}
			/>
			<Text
				x={margins.left + 98}
				y={17}
				style={{ fontSize: 9, color: "#0f172a" }}
			>
				Costs (business + building)
			</Text>
		</Svg>
	);
}
