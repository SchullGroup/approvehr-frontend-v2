// Demo figures from the local Schull data, H2 2026 appraisal.
window.FAIRNESS = {
  people: [
    {
      name: "Ronke Okeke",
      role: "DevOps Engineer · Engineering",
      dir: "below",
      mark: 39.55,
      rec: 62.19,
      why: "No pattern applies",
      patterns: [],
      note: "Ronke’s mark of 39.55% is 22.64 points below what their record suggests. Their manager, Adaeze Okonkwo, describes personality — “difficult to work with”, “not a culture fit” — rather than results, which is hard to defend if the mark is challenged. Ask Adaeze what work the 2 out of 5 is based on before calibration.",
      mgr: [
        "Adaeze Okonkwo",
        "2 out of 5",
        "Gets the work done, but is difficult to work with and not really a culture fit for the team.",
      ],
      self: [
        "4 out of 5",
        "I hit my targets and helped onboard two new starters.",
      ],
      record: [
        "68% achieved · 1 objective, measured by key results",
        "Fewer than 3 colleagues answered",
        "47.66% average over 2 periods",
      ],
    },
    {
      name: "Halimat Akande",
      role: "Product Designer · Product",
      dir: "below",
      mark: 31.37,
      rec: 50.73,
      why: "No pattern applies",
      patterns: [],
      note: "Halimat’s mark of 31.37% is 19.36 points below their record of 50.73%. No known pattern applies and nothing has been written by either side yet. Worth asking their manager what the mark is based on.",
      mgr: null,
      self: null,
      record: [
        "53% achieved · 1 objective, measured by key results",
        "Fewer than 3 colleagues answered",
        "45.05% average over 2 periods",
      ],
    },
    {
      name: "Kelechi Salami",
      role: "Accountant · Finance",
      dir: "below",
      mark: 50.14,
      rec: 68.83,
      why: "Sharp drop against past marks",
      patterns: [
        "Their mark is 25.77 points below their own average over the last 2 periods.",
      ],
      note: "Kelechi’s mark of 50.14% is 18.69 points below their record and 25.77 points below their own recent average. Tunde Bakare’s review says only “needs to step up”, while Kelechi reports finishing both projects and a client renewal. Raise it at calibration and ask what changed.",
      mgr: ["Tunde Bakare", "2 out of 5", "Needs to step up."],
      self: [
        "4 out of 5",
        "I finished both projects I owned and the client renewed.",
      ],
      record: [
        "66% achieved · 1 objective, measured by key results",
        "Fewer than 3 colleagues answered",
        "75.91% average over 2 periods",
      ],
    },
    {
      name: "Zainab Onyeka",
      role: "Finance Associate · Finance",
      dir: "above",
      mark: 82.53,
      rec: 69.96,
      why: "Finance and Tunde Bakare mark high",
      patterns: [
        "Finance is marked 16 points above everyone else.",
        "Their manager, Tunde Bakare, marks 17.3 points above other managers.",
      ],
      note: "Zainab’s mark of 82.53% is 12.57 points above their record of 69.96%. Finance and their manager, Tunde Bakare, both mark well above everyone else, which could account for the gap. Worth raising at calibration.",
      mgr: null,
      self: null,
      record: [
        "67% achieved · 1 objective, measured by key results",
        "Fewer than 3 colleagues answered",
        "77.35% average over 2 periods",
      ],
    },
    {
      name: "Chidubem Balogun",
      role: "Finance Associate · Finance",
      dir: "above",
      mark: 73.85,
      rec: 63.23,
      why: "Finance and Tunde Bakare mark high",
      patterns: [
        "Finance is marked 16 points above everyone else.",
        "Their manager, Tunde Bakare, marks 17.3 points above other managers.",
      ],
      note: "Chidubem’s mark of 73.85% is 10.62 points above their record. Tunde Bakare gave 5 out of 5 for being “a pleasure to work with”, while Chidubem says they “fell behind on two of my milestones”. Both patterns could account for the gap; worth raising at calibration.",
      mgr: [
        "Tunde Bakare",
        "5 out of 5",
        "A pleasure to work with. Always positive and a great presence in the office.",
      ],
      self: [
        "3 out of 5",
        "I fell behind on two of my milestones because of the system migration.",
      ],
      record: [
        "55% achieved · 1 objective, measured by key results",
        "66.67% from 3 colleagues",
        "70.1% average over 2 periods",
      ],
    },
    {
      name: "Chukwuma Adeyemi",
      role: "Treasury Analyst · Finance",
      dir: "above",
      mark: 73.79,
      rec: 63.44,
      why: "Finance and Tunde Bakare mark high",
      patterns: [
        "Finance is marked 16 points above everyone else.",
        "Their manager, Tunde Bakare, marks 17.3 points above other managers.",
      ],
      note: "Chukwuma’s mark of 73.79% is 10.35 points above their record. Both Finance and Tunde Bakare mark high this period, which could account for most of the gap. Worth raising at calibration.",
      mgr: null,
      self: null,
      record: [
        "58% achieved · 1 objective, measured by key results",
        "Fewer than 3 colleagues answered",
        "None on record",
      ],
    },
  ],
  unclear: 6,
  matches: 40,
  compared: 58,
  average: 60.2,
  groups: {
    Department: {
      flag: "Finance is marked 16 points above everyone else.",
      rows: [
        ["Finance", 74.1, 9, true],
        ["Engineering", 58.3, 14],
        ["Operations", 57.6, 11],
        ["Product", 56.9, 8],
        ["People", 59.8, 7],
      ],
    },
    Gender: {
      flag: null,
      rows: [
        ["Women", 59.1, 27],
        ["Men", 61.2, 31],
      ],
    },
    "Time at the company": {
      flag: null,
      rows: [
        ["Under 1 year", 58.4, 10],
        ["1–3 years", 60.9, 26],
        ["Over 3 years", 60.6, 22],
      ],
    },
  },
  managers: [
    ["Tunde Bakare", 7, 77.1, 17.3, "Marks well above other managers"],
    ["Halima Sani", 6, 60.0, -0.4, "Gave 83% of the team the same band"],
    ["Chidi Nwosu", 7, 59.4, -1.0, ""],
    ["Adaeze Okonkwo", 8, 58.9, -1.6, ""],
  ],
  moves: [
    ["Ifeoma Bello", 62.4, 67.4, "Moderated against peers in the same team"],
    [
      "Segun Adeyemi",
      71.0,
      66.0,
      "Targets were set lower than the department’s",
    ],
    ["Funke Adebayo", 55.2, 60.2, "Took over a struggling project mid-period"],
  ],
};

window.fmt = (n) => `${+n.toFixed(2)}`;
window.gapOf = (p) => p.mark - p.rec;

// The person detail, shared by every option so only the layout around it differs.
window.personDetail = (p, opts = {}) => {
  const lo = Math.min(p.mark, p.rec),
    hi = Math.max(p.mark, p.rec),
    gap = p.mark - p.rec;
  const first = p.name.split(" ")[0];
  return `
    ${opts.header === false ? "" : `<div style="font-size:22px;font-weight:600;letter-spacing:-0.01em">${p.name}</div><div class="role">${p.role}</div>`}
    <dl class="figs" style="margin-top:${opts.header === false ? 0 : 24}px"><div><dt>Mark</dt><dd>${fmt(p.mark)}%</dd></div><div><dt>Record suggests</dt><dd>${fmt(p.rec)}%</dd></div><div><dt>Gap</dt><dd class="gap">${gap < 0 ? "−" : "+"}${fmt(Math.abs(gap))}</dd></div></dl>
    <div class="scale"><div class="t"></div><div class="g" style="left:${lo}%;width:${hi - lo}%"></div><div class="r" style="left:${p.rec}%"></div><div class="m" style="left:${p.mark}%"></div></div>
    <div class="legend"><span>0%</span><span>● Mark &nbsp; ○ Record</span><span>100%</span></div>
    <div class="label ai">✦ AI summary · written 15 Oct</div>
    <p class="note">${p.note}</p>
    <div class="fine">Written by AI. It can be wrong.</div>
    <div class="label">Patterns that apply</div>
    ${p.patterns.length ? `<ul class="pat">${p.patterns.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p class="who">None. Their manager marks close to average and none of their groups is flagged.</p>`}
    <div class="label">What each side wrote</div>
    ${
      p.mgr
        ? `<p class="who"><b>${p.mgr[0]}</b>, manager · ${p.mgr[1]}</p><div class="quote">${p.mgr[2]}</div>
      <p class="who"><b>${first}</b>, self-review · ${p.self[0]}</p><div class="quote">${p.self[1]}</div>`
        : `<p class="who">Nothing written yet by either side.</p>`
    }
    <div class="label">How the record figure is worked out</div>
    <dl class="rec"><div><dt>Objectives</dt><dd>${p.record[0]}</dd></div><div><dt>Peer feedback</dt><dd>${p.record[1]}</dd></div><div><dt>Previous periods</dt><dd>${p.record[2]}</dd></div></dl>`;
};
