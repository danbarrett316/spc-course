# In Control

**Take the course: https://danbarrett316.github.io/spc-course/**

A free, interactive course in statistical process control (SPC), built on chapter 6,
"Process or Product Monitoring and Control", of the
[NIST/SEMATECH e-Handbook of Statistical Methods](https://www.itl.nist.gov/div898/handbook/pmc/pmc.htm).

Twelve modules, each with live simulations, worked examples from the handbook, and
self-marking checks:

| Part | Modules |
|---|---|
| Foundations | 1 Variation and control · 2 How control charts work |
| Shewhart charts | 3 X̄ and R or s charts · 4 Individuals and moving range · 5 Defects and defectives (p, np, c, u) |
| Detecting small shifts | 6 CUSUM · 7 EWMA |
| Fit for purpose | 8 Process capability · 9 Lot acceptance sampling |
| Beyond one variable | 10 Multivariate charts · 11 Time series and forecasting |
| Capstone | 12 Case study: a lithography process |

Plus a formula sheet, a "which chart should I use?" guide and a glossary.

## Run it locally

It is a static site with no build step and no dependencies.

```bash
python3 tools/serve.py
```

Then open http://127.0.0.1:8123. Any static file server works; `tools/serve.py` just turns off
browser caching so edits show up on reload.

## Host it for free

Upload the folder as-is to any static host. There is no build command, and the publish
directory is the repository root.

- **GitHub Pages**: push to a public repository, then Settings → Pages → Deploy from a branch → `main` / root.
- **Netlify** or **Cloudflare Pages**: connect the repository (or drag and drop the folder), leave the
  build command empty and set the output directory to `/`.

The only third-party requests are Google Fonts and KaTeX (math rendering) from jsDelivr.
Reader progress is kept in each reader's browser (localStorage); there are no accounts,
cookies or analytics.

## How it is built

```
index.html               home page and course map
modules/                 one page per module
reference/               formula sheet, chart chooser, glossary
assets/css/course.css    design system: tokens, layout, components, chart styles
assets/js/chart.js       small declarative SVG charting kit
assets/js/stats.js       distributions, SPC constants, chart computations, seeded RNG
assets/js/course.js      shared page chrome: course rail, numbering, checks, footer
assets/js/modules/       one script per module with its interactive figures
```

[AUTHORING.md](AUTHORING.md) documents the conventions and APIs for adding or editing a module.

## Credits

Content follows the NIST/SEMATECH e-Handbook of Statistical Methods (NIST, 2012), a U.S.
government publication. Worked examples reuse the handbook's published data where noted.
Explanations, simulations and figures were written for this course. The lithography case
study uses data simulated from the handbook's study design and variance components.
