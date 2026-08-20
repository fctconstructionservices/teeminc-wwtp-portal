import { dayOf, num } from './util.js';

const DAY_MS = 86400000;

function atMidnight(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDay(v) {
  const s = dayOf(v);
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** daysBetween - inclusive count, so a one-day task is 1 and not 0. */
function daysBetween(a, b) {
  return Math.round((atMidnight(b) - atMidnight(a)) / DAY_MS) + 1;
}

function overlapDays(aStart, aEnd, bStart, bEnd) {
  const from = aStart > bStart ? aStart : bStart;
  const to = aEnd < bEnd ? aEnd : bEnd;
  if (to < from) return 0;
  return daysBetween(from, to);
}

/**
 * buildBuckets - the intervals every series is bucketed into.
 *
 * Monthly buckets are calendar months. Weekly buckets run Monday to
 * Sunday, which is what "this week" means on a site, and are capped to a
 * window around today so a two-year project does not produce 100 columns
 * nobody can read.
 */
export function buildBuckets(mode, minDate, maxDate, now) {
  const buckets = [];
  const start = atMidnight(minDate);
  const end = atMidnight(maxDate);

  if (mode === 'weekly') {
    // Back up to the Monday of the first week.
    let cur = atMidnight(start);
    cur = new Date(cur.getTime() - ((cur.getDay() + 6) % 7) * DAY_MS);

    const all = [];
    while (cur <= end && all.length < 400) {
      const bEnd = new Date(cur.getTime() + 6 * DAY_MS);
      all.push({ start: new Date(cur), end: bEnd });
      cur = new Date(cur.getTime() + 7 * DAY_MS);
    }
    // Keep a readable window: ~16 weeks back from today, 60 max.
    let slice = all;
    if (all.length > 60) {
      const todayIdx = all.findIndex((b) => now >= b.start && now <= b.end);
      const from = Math.max(0, (todayIdx === -1 ? 0 : todayIdx) - 16);
      slice = all.slice(from, from + 60);
    }
    for (const b of slice) {
      buckets.push({
        start: b.start,
        end: b.end,
        label: b.start.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
      });
    }
    return buckets;
  }

  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last && buckets.length < 36) {
    const bStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const bEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    buckets.push({
      start: bStart,
      end: bEnd,
      label: bStart.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (!buckets.length) {
    const bStart = new Date(now.getFullYear(), now.getMonth(), 1);
    buckets.push({ start: bStart, end: new Date(now.getFullYear(), now.getMonth() + 1, 0), label: bStart.toLocaleString('en-US', { month: 'short', year: '2-digit' }) });
  }
  return buckets;
}

/**
 * spreadAcrossSchedule - a scope's value, divided evenly per DAY of its
 * schedule and then summed into whichever buckets those days fall in.
 *
 * This is what makes the projection change with the interval: a
 * ₱100,000 scope running 1–14 August contributes ₱50,000 to each of the
 * two weeks, or the whole ₱100,000 to August as a month. Dividing by
 * bucket instead of by day would give the same number to a one-day task
 * and a three-week one.
 */
/**
 * spreadAcrossSchedule - divide each item's value per day and sum into
 * buckets. Without `notBefore` this is the plan as scheduled.
 *
 * With `notBefore` (the forecast) the WHOLE value is divided across the
 * days from that date to the item's end, rather than taking a full-
 * schedule rate and plotting only the tail. Doing the latter silently
 * dropped the elapsed share — a scope running Jan–Dec had two thirds of
 * its value disappear from the forecast — so the curve never fell by
 * what the work actually costs.
 */
function spreadAcrossSchedule(buckets, items, valueOf, out, notBefore) {
  const nowBucket = notBefore
    ? Math.max(0, buckets.findIndex((b) => notBefore >= b.start && notBefore <= b.end))
    : 0;

  for (const s of items) {
    const value = valueOf(s);
    if (!(value > 0)) continue;
    const sS = parseDay(s.startDate);
    const sE = parseDay(s.endDate);

    if (!notBefore) {
      if (!sS || !sE || sE < sS) continue;
      const perDay = value / daysBetween(sS, sE);
      for (let i = 0; i < buckets.length; i++) {
        const days = overlapDays(buckets[i].start, buckets[i].end, sS, sE);
        if (days) out[i] += perDay * days;
      }
      continue;
    }

    // Work with no schedule, or already past its end date, is still money
    // owed — it lands on the current interval rather than vanishing.
    if (!sS || !sE || sE < notBefore) {
      out[nowBucket] += value;
      continue;
    }

    const from = sS > notBefore ? sS : notBefore;
    const perDay = value / daysBetween(from, sE);
    let placed = 0;
    for (let i = 0; i < buckets.length; i++) {
      const days = overlapDays(buckets[i].start, buckets[i].end, from, sE);
      if (days) { out[i] += perDay * days; placed += perDay * days; }
    }
    // Anything beyond the charted window still has to be accounted for,
    // otherwise the forecast quietly under-spends.
    if (placed < value - 0.005) out[buckets.length - 1] += value - placed;
  }
}

/**
 * buildProjectSeries - cashflow and earned-value for one interval.
 *
 * PROJECTED OUTFLOW is what the job is likely to spend in each interval:
 * the ESTIMATED value of scheduled work, spread per day across its
 * Gantt dates, plus requests already in flight (pending advances and
 * purchase requests) landing on the date they are needed. Estimate
 * rather than budget, because the estimate is what the work was priced
 * at — the budget is the internal allowance and may never have been set.
 *
 * PLANNED VALUE is deliberately the BUDGET, spread the same way: it
 * answers "how much did we plan to have spent by now", which is a
 * different question from "what will this cost". Where a scope carries
 * no budget the estimate stands in, otherwise PV would read flat zero
 * for a project priced entirely by estimate.
 */
export function buildProjectSeries(opts) {
  const {
    mode, now, sowItems, incoming, releases, pendingRequests,
    progressIndex, progressAsOf, spanDates,
  } = opts;

  const dates = spanDates.map(parseDay).filter(Boolean);
  dates.push(atMidnight(now));
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  const buckets = buildBuckets(mode, minDate, maxDate, now);
  const n = buckets.length;
  const labels = buckets.map((b) => b.label);
  const nowIndex = buckets.findIndex((b) => now >= b.start && now <= b.end);
  const isPast = (i) => (nowIndex === -1 ? buckets[i].end < now : i <= nowIndex);

  const bucketOf = (v) => {
    const d = parseDay(v);
    if (!d) return -1;
    return buckets.findIndex((b) => d >= b.start && d <= b.end);
  };

  const inflow = new Array(n).fill(0);
  const outflow = new Array(n).fill(0);
  for (const r of incoming) {
    const i = bucketOf(r.transactionDate || r.createdAt);
    if (i >= 0) inflow[i] += num(r.amount);
  }
  for (const r of releases) {
    const i = bucketOf(r.releasedAt || r.createdAt);
    if (i >= 0) outflow[i] += num(r.amount);
  }

  const work = sowItems.filter((s) => !s.isHeading && !s.isMilestone);

  // ── Projected outflow: a FORECAST, so it starts at today ──
  // Spending it across past intervals drew a projection over months
  // whose real spend is already on the chart as actual bars, which
  // invited reading the same money twice. Work that finished before
  // today contributes nothing; work in flight contributes only the days
  // it has left.
  const todayD = atMidnight(now);
  const projected = new Array(n).fill(0);
  spreadAcrossSchedule(
    buckets, work,
    (s) => (s.estimateTotal || 0) + (s.voAdjustment || 0),
    projected, todayD
  );

  // Requests already in flight are committed money the Gantt does not
  // know about, so they are added on the date they are needed rather
  // than spread — they will be paid when they are paid.
  for (const r of pendingRequests) {
    let i = bucketOf(r.dateNeeded || r.createdAt);
    if (i === -1) i = nowIndex === -1 ? 0 : nowIndex;   // overdue lands on now
    // Never behind today: a request still pending is future spend
    // however overdue the date on it is.
    if (nowIndex > -1 && i < nowIndex) i = nowIndex;
    projected[i] += num(r.amount);
  }

  // ── Net cash: actual to today, forecast beyond ──
  //
  // The forecast MEETS the actual line at the current interval — they
  // share that point so the chart reads as one curve — and every
  // interval from the current one onward is then subtracted, the
  // current one included. Skipping it (because the join point had
  // already been written) was leaving this interval's spend out of the
  // projection entirely.
  const netActual = new Array(n).fill(null);
  const netForecast = new Array(n).fill(null);

  let running = 0;
  let cashNow = 0;
  for (let i = 0; i < n; i++) {
    if (!isPast(i)) break;
    running += inflow[i] - outflow[i];
    netActual[i] = Math.round(running);
    cashNow = running;
  }

  const joinAt = nowIndex > -1 ? nowIndex : netActual.findLastIndex((v) => v !== null);
  if (joinAt > -1) netForecast[joinAt] = Math.round(cashNow);

  let forecast = cashNow;
  for (let i = Math.max(joinAt, 0); i < n; i++) {
    forecast -= projected[i];
    if (i > joinAt) netForecast[i] = Math.round(forecast);
  }

  const cashflow = {
    labels,
    inflow: inflow.map(Math.round),
    outflow: outflow.map(Math.round),
    projectedOutflow: projected.map(Math.round),
    netActual,
    netForecast,
    nowIndex,
  };

  // ── Earned value ──
  const plannedBasis = (s) => (num(s.budget) > 0 ? num(s.budget) : (s.estimateTotal || 0) + (s.voAdjustment || 0));

  // PV is cumulative, so spread per bucket then accumulate.
  const pvPerBucket = new Array(n).fill(0);
  spreadAcrossSchedule(buckets, work, plannedBasis, pvPerBucket);
  const pvSeries = [];
  let pvRun = 0;
  for (let i = 0; i < n; i++) { pvRun += pvPerBucket[i]; pvSeries.push(Math.round(pvRun)); }

  const acSeries = [];
  let acRun = 0;
  for (let i = 0; i < n; i++) {
    acRun += outflow[i];
    acSeries.push(isPast(i) ? Math.round(acRun) : null);
  }

  const evSeries = buckets.map((b, i) => {
    if (!isPast(i)) return null;
    const cutD = b.end < now ? b.end : now;
    const cut = cutD.toISOString().slice(0, 10);
    let ev = 0;
    for (const s of work) {
      const basis = (s.estimateTotal || 0) + (s.voAdjustment || 0);
      if (!basis) continue;
      ev += basis * (progressAsOf(progressIndex, s.id, cut) / 100);
    }
    return Math.round(ev);
  });

  const evNow = work.reduce((t, s) => t + ((s.estimateTotal || 0) + (s.voAdjustment || 0)) * (num(s.progress) / 100), 0);
  const pvNow = nowIndex > -1 ? pvSeries[nowIndex] : (pvSeries[n - 1] || 0);
  const bac = work.reduce((t, s) => t + plannedBasis(s), 0);

  return {
    cashflow,
    evm: {
      labels, pvSeries, acSeries, evSeries, nowIndex,
      pv: Math.round(pvNow),
      ev: Math.round(evNow),
      ac: Math.round(opts.accruedCost),
      bac: Math.round(bac),
      spi: pvNow > 0 ? Math.round((evNow / pvNow) * 100) / 100 : null,
      cpi: opts.accruedCost > 0 ? Math.round((evNow / opts.accruedCost) * 100) / 100 : null,
    },
  };
}
