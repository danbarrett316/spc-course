// course-data.js: the course outline. The rail, the home page map and the
// previous/next links are all generated from this one list.

export const COURSE = {
  name: 'In Control',
  tagline: 'A free, interactive course in statistical process control',
  source: 'https://www.itl.nist.gov/div898/handbook/pmc/pmc.htm',
};

export const PARTS = [
  { title: 'Foundations', modules: [1, 2] },
  { title: 'Shewhart charts', modules: [3, 4, 5] },
  { title: 'Detecting small shifts', modules: [6, 7] },
  { title: 'Fit for purpose', modules: [8, 9] },
  { title: 'Beyond one variable', modules: [10, 11] },
  { title: 'Capstone', modules: [12] },
];

export const MODULES = [
  { n: 1, slug: '01-variation', title: 'Variation and control', short: 'Variation and control',
    blurb: 'Common causes, special causes, and what it means for a process to be predictable.', minutes: 20, nist: ['6.1'] },
  { n: 2, slug: '02-control-charts', title: 'How control charts work', short: 'How control charts work',
    blurb: 'Center lines, three-sigma limits, false alarms, run rules and average run length.', minutes: 25, nist: ['6.3.1', '6.3.2'] },
  { n: 3, slug: '03-xbar-r-s', title: 'X̄ and R or s charts', short: 'X̄ and R / s charts',
    blurb: 'Chart subgroup averages and spread, and see where the constants come from.', minutes: 30, nist: ['6.3.2.1'] },
  { n: 4, slug: '04-individuals', title: 'Individuals and moving range charts', short: 'Individuals charts',
    blurb: 'Monitoring one measurement at a time, with spread estimated from neighbours.', minutes: 20, nist: ['6.3.2.2'] },
  { n: 5, slug: '05-attributes', title: 'Charts for defects and defectives', short: 'Attributes charts',
    blurb: 'p, np, c and u charts for counts and proportions.', minutes: 25, nist: ['6.3.3'] },
  { n: 6, slug: '06-cusum', title: 'CUSUM charts', short: 'CUSUM charts',
    blurb: 'Accumulate small deviations until a persistent shift cannot hide.', minutes: 25, nist: ['6.3.2.3'] },
  { n: 7, slug: '07-ewma', title: 'EWMA charts', short: 'EWMA charts',
    blurb: 'A weighted memory of the process, tuned by a single smoothing constant.', minutes: 20, nist: ['6.3.2.4'] },
  { n: 8, slug: '08-capability', title: 'Process capability', short: 'Process capability',
    blurb: 'Cp, Cpk and Cpm: does the process fit inside the specification?', minutes: 25, nist: ['6.1.6', '6.5.1', '6.5.2'] },
  { n: 9, slug: '09-acceptance-sampling', title: 'Lot acceptance sampling', short: 'Acceptance sampling',
    blurb: 'OC curves, AQL and LTPD, and inspection plans that protect both sides.', minutes: 30, nist: ['6.2'] },
  { n: 10, slug: '10-multivariate', title: 'Multivariate control charts', short: 'Multivariate charts',
    blurb: 'Hotelling T², principal components and MEWMA for correlated measurements.', minutes: 30, nist: ['6.3.4', '6.5.3', '6.5.4', '6.5.5'] },
  { n: 11, slug: '11-time-series', title: 'Time series and forecasting', short: 'Time series',
    blurb: 'Moving averages, exponential smoothing and Box–Jenkins models.', minutes: 35, nist: ['6.4'] },
  { n: 12, slug: '12-case-study', title: 'Case study: a lithography process', short: 'Lithography case study',
    blurb: 'Untangle three sources of variation on a semiconductor line and choose the right charts.', minutes: 30, nist: ['6.6.1'] },
];

export const REFERENCE = [
  { slug: 'formulas', title: 'Formula sheet' },
  { slug: 'chooser', title: 'Which chart should I use?' },
  { slug: 'glossary', title: 'Glossary' },
];

/** NIST handbook URL for a section number like "6.3.2.1". */
export function nistUrl(sec) {
  const parts = sec.split('.').slice(1);
  if (!parts.length) return COURSE.source;
  return `https://www.itl.nist.gov/div898/handbook/pmc/section${parts[0]}/pmc${parts.join('')}.htm`;
}
