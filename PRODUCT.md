# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

UK electricity buying teams inspecting wind forecasts before day-ahead purchases.
The take-home reviewer also needs to trace decisions and calculations.

## Product Purpose

Reconstruct the wind forecast available at a January 2026 decision cutoff and
quantify historical forecast error using Elexon data.

## Operating Context

Fixed historical snapshot. The decision view excludes future actuals. A separate
retrospective view reveals outcomes after delivery. Date and cutoff exploration
must reuse cached responses and keep displayed data tied to the selected inputs.

## Capabilities and Constraints

React frontend, Python backend, Docker, deployment on Vercel or Heroku. Only
Elexon WINDFOR and WIND-filtered FUELHH data. No purchase recommendations, prices,
demand, trained models, causal explanations, or guaranteed prediction intervals.
Hourly-average alignment is provisional and must remain visible. The default
09:00 cutoff is a product assumption; other times are exploratory scenarios.

## Brand Commitments

The user explicitly requested a design close to https://reint.ai/ so the founder
feels at home. Preserve the reference's Inter typography, light surface, charcoal
text and restrained green. This is an assignment prototype, not an official product.

## Evidence on Hand

`data/elexon.sqlite3`, raw responses and checksums: 19,856 forecast revisions and
1,536 actual observations. Python decision/review APIs and timing/coverage tests.

## Product Principles

- Keep forecast provenance and analysis assumptions inspectable.
- Distinguish decision-time knowledge from later outcomes.
- Show missing coverage instead of inventing values.
- Let the generation profile lead, with metrics and record details supporting it.
