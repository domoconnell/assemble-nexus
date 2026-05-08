"use client";
import React, { useEffect, useRef } from "react";


export function LayeredWavesBackground({
  className,
  style,
  speed = 0.18,          // overall animation speed (lower = slower)
  layers = 7,            // number of wave layers
  grain = 0.08,          // 0 disables, 0.06–0.12 nice
  contrast = 1.05,       // subtle punch
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    const colours = ["#150D3F", "#3f359c", "#f64971"]; // deep, indigo, pink

    // --- helpers ---
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;

    function hexToRgb(hex) {
      const h = hex.replace("#", "");
      const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    }

    function mixHex(a, b, t) {
      const A = hexToRgb(a);
      const B = hexToRgb(b);
      const r = Math.round(lerp(A.r, B.r, t));
      const g = Math.round(lerp(A.g, B.g, t));
      const b2 = Math.round(lerp(A.b, B.b, t));
      return `rgb(${r},${g},${b2})`;
    }

    // Smooth-ish pseudo noise: sum of sines (cheap, stable, no deps)
    function fbm(x, t) {
      // “fractal brownian motion” vibe using multiple frequencies
      const a =
        Math.sin(x * 0.006 + t * 0.30) * 0.60 +
        Math.sin(x * 0.012 - t * 0.22) * 0.30 +
        Math.sin(x * 0.020 + t * 0.15) * 0.18;
      return a; // roughly [-1..1]
    }

    // Draw a single wavy “hill” layer
    function drawLayer(w, h, i, time) {
      // back layers higher, front layers lower
      const depthT = i / (layers - 1 || 1); // 0..1
      const inv = 1 - depthT;

      // Baseline moves down with depth (front layers closer to bottom)
      const baseY = lerp(h * 0.22, h * 0.88, depthT);

      // Amplitude increases slightly towards the front
      const amp = lerp(h * 0.03, h * 0.10, depthT);

      // Wavelength: back layers are smoother/longer
      const wav = lerp(0.004, 0.012, depthT);

      // Slow drift per layer (slightly different speeds)
      const layerTime = time * speed * (0.55 + depthT * 0.9) + i * 10.0;

      // Colour choice per layer: blend deep -> indigo -> pink
      // Bias so top = bluer, bottom = pinker, but still brand-consistent
      const colourT = clamp01(depthT * 1.08);
      const c1 = mixHex(colours[0], colours[1], clamp01(colourT * 1.1)); // deep->indigo
      const c2 = mixHex(colours[1], colours[2], clamp01(colourT));       // indigo->pink
      const fillA = lerp(0.55, 0.92, depthT);

      // Soft gradient fill inside the layer (gives that “paper light” feel)
      const grad = ctx.createLinearGradient(0, baseY - amp * 2, 0, baseY + amp * 3);
      grad.addColorStop(0, `${c1.replace("rgb", "rgba").replace(")", `,${fillA * 0.85})`)}`);
      grad.addColorStop(1, `${c2.replace("rgb", "rgba").replace(")", `,${fillA})`)}`);

      ctx.beginPath();
      ctx.moveTo(0, h);

      // Wave path
      const step = Math.max(10, Math.floor(w / 140)); // fewer points = smoother
      for (let x = 0; x <= w + step; x += step) {
        const nx = x;
        const n = fbm(nx + i * 200, layerTime); // [-1..1]
        const y =
          baseY +
          Math.sin(nx * wav + layerTime * 0.9) * amp * 0.65 +
          Math.sin(nx * wav * 0.55 - layerTime * 0.6) * amp * 0.35 +
          n * amp * 0.35;
        ctx.lineTo(nx, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle rim light on top edge (makes layers read nicely)
      ctx.save();
      ctx.globalAlpha = lerp(0.06, 0.14, inv);
      ctx.lineWidth = lerp(2.0, 1.0, depthT);
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.stroke();
      ctx.restore();
    }

    function drawGrain(w, h, amount) {
      if (!amount || amount <= 0) return;
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      // light-touch grain: only a few pixels each frame to keep it cheap
      const pixels = Math.floor(w * h * 0.015);
      for (let p = 0; p < pixels; p++) {
        const idx = (Math.random() * w * h) | 0;
        const i = idx * 4;
        const g = ((Math.random() * 2 - 1) * 255 * amount) | 0;
        d[i] = d[i] + g;
        d[i + 1] = d[i + 1] + g;
        d[i + 2] = d[i + 2] + g;
      }
      ctx.putImageData(img, 0, 0);
    }

    // Fit canvas to parent size (and handle DPR)
    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);
    resize();

    let start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 1000;

      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Background base gradient (top: indigo-ish, bottom: pink-ish)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, mixHex("#150D3F", "#3f359c", 0.55));
      bg.addColorStop(0.55, mixHex("#3f359c", "#f64971", 0.15));
      bg.addColorStop(1, mixHex("#3f359c", "#f64971", 0.75));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Slight global contrast punch
      ctx.save();
      ctx.globalAlpha = 1;
      // draw layers back-to-front
      for (let i = 0; i < layers; i++) {
        drawLayer(w, h, i, t);
      }
      ctx.restore();

      // Optional grain
      drawGrain(Math.floor(w), Math.floor(h), grain);

      // Optional subtle vignette for legibility
      const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, `rgba(0,0,0,${0.28})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Micro contrast: light overlay (cheap “pop”)
      if (contrast && contrast !== 1) {
        ctx.save();
        ctx.globalAlpha = clamp01((contrast - 1) * 0.35);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [speed, layers, grain, contrast]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        width: "100%",
        height: "100%",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}