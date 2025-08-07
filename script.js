let running = false;
let startTimeMs = 0;
let initialElapsedSec = 0;
let currentValue = 0;
let animationHandle = null;
let chart = null;

const secondsPerYear = 365 * 24 * 60 * 60;
const secondsPerDay = 24 * 60 * 60;

function getInputs() {
    return {
        amount: parseFloat(document.getElementById('amount').value) || 0,
        apr: parseFloat(document.getElementById('rate').value) || 0,
        compounding: (document.getElementById('compounding')?.value) || 'continuous',
        contributionAmount: parseFloat(document.getElementById('contributionAmount')?.value) || 0,
        contributionFrequency: (document.getElementById('contributionFrequency')?.value) || 'none',
        withdrawAmount: parseFloat(document.getElementById('withdrawAmount')?.value) || 0,
        withdrawFrequency: (document.getElementById('withdrawFrequency')?.value) || 'none',
        currency: (document.getElementById('currency')?.value) || 'USD',
        inflationRate: parseFloat(document.getElementById('inflationRate')?.value) || 0,
        showReal: !!document.getElementById('showReal')?.checked,
        managementFee: parseFloat(document.getElementById('managementFee')?.value) || 0,
        performanceFee: parseFloat(document.getElementById('performanceFee')?.value) || 0,
        taxRate: parseFloat(document.getElementById('taxRate')?.value) || 0,
        customDays: parseInt(document.getElementById('customDays')?.value || '365', 10),
        aprSchedule: document.getElementById('aprSchedule')?.value || '',
        sensitivityRange: parseFloat(document.getElementById('sensitivityRange')?.value) || 0.5,
        showSensitivity: !!document.getElementById('showSensitivity')?.checked,
    };
}

function getFormatter(currency, decimals = 2) {
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } catch (e) {
        return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
}

function formatCurrency(val) {
    const { currency } = getInputs();
    const fmt = getFormatter(currency, 2);
    return fmt.format(Number(val));
}

function formatCurrencyWithDecimals(val, decimals) {
    const { currency } = getInputs();
    const fmt = getFormatter(currency, decimals);
    return fmt.format(Number(val));
}

function compPeriodsPerYear(compounding) {
    switch (compounding) {
        case 'daily': return 365;
        case 'weekly': return 52;
        case 'monthly': return 12;
        case 'quarterly': return 4;
        case 'yearly': return 1;
        default: return 'continuous';
    }
}

function computeApy(apr, compounding) {
    const n = compPeriodsPerYear(compounding);
    if (n === 'continuous') {
        return (Math.exp(apr / 100) - 1) * 100;
    }
    return (Math.pow(1 + apr / 100 / n, n) - 1) * 100;
}

function updateApyDisplay() {
    const inputs = getInputs();
    const apy = computeApy(inputs.apr, inputs.compounding);
    const netApr = effectiveNetApr(inputs.apr, inputs);
    const apyNet = computeApy(netApr, inputs.compounding);
    const apyEl = document.getElementById('apyDisplay');
    if (apyEl) apyEl.textContent = `APY: ${apy.toFixed(2)}% (net: ${apyNet.toFixed(2)}%)`;
}

function parseAprSchedule(text) {
    const rows = (text || '').split(/\n+/).map(r => r.trim()).filter(Boolean);
    const schedule = [];
    for (const row of rows) {
        const [m, r] = row.split(',').map(s => s.trim());
        const mo = parseFloat(m);
        const apr = parseFloat(r);
        if (!Number.isNaN(mo) && !Number.isNaN(apr)) schedule.push({ monthOffset: mo, apr });
    }
    schedule.sort((a, b) => a.monthOffset - b.monthOffset);
    return schedule;
}

function getAprAtMonth(schedule, month) {
    if (schedule.length === 0) return null;
    let current = schedule[0].apr;
    for (const item of schedule) {
        if (month >= item.monthOffset) current = item.apr;
        else break;
    }
    return current;
}

function effectiveNetApr(apr, inputs) {
    const mgmt = Math.max(0, inputs.managementFee || 0);
    const gross = Math.max(0, apr - mgmt);
    const perf = Math.max(0, inputs.performanceFee || 0);
    const tax = Math.max(0, inputs.taxRate || 0);
    const takeRate = Math.max(0, 1 - (perf + tax) / 100);
    let net = gross * takeRate;
    if (inputs.showReal) {
        net = net - (inputs.inflationRate || 0);
    }
    return Math.max(-100, net);
}

function dailyGrowthFactorFromApr(apr, compounding) {
    const n = compPeriodsPerYear(compounding);
    if (n === 'continuous') {
        return Math.exp(apr / 100 / 365);
    }
    // Approximate by converting per-year discrete comp into daily equivalent
    return Math.pow(1 + apr / 100 / n, n / 365);
}

function isContributionDay(dayIndex, frequency) {
    if (frequency === 'none') return false;
    if (frequency === 'daily') return true;
    if (frequency === 'weekly') return dayIndex % 7 === 6; // every 7th day
    if (frequency === 'monthly') return dayIndex % 30 === 29; // approx monthly
    return false;
}

function project(days, baseInputs, aprBump = 0) {
    const inputs = { ...baseInputs };
    const schedule = parseAprSchedule(inputs.aprSchedule);
    const result = {
        days: [],
        balances: [],
        principalsOnly: [],
        contributionsOnly: [],
    };
    let balance = inputs.amount;
    let contributed = 0;
    let withdrawn = 0;
    const start = new Date();
    for (let d = 0; d <= days; d += 1) {
        const months = d / 30.4375;
        const scheduledApr = schedule.length ? getAprAtMonth(schedule, months) : inputs.apr;
        const netApr = effectiveNetApr((scheduledApr ?? inputs.apr) + aprBump, inputs);
        const growth = dailyGrowthFactorFromApr(netApr, inputs.compounding);
        if (d > 0) balance *= growth;
        // contribution at end of day
        if (d > 0 && isContributionDay(d, inputs.contributionFrequency) && inputs.contributionAmount > 0) {
            balance += inputs.contributionAmount;
            contributed += inputs.contributionAmount;
        }
        // withdrawal at end of day
        if (d > 0 && isContributionDay(d, inputs.withdrawFrequency) && inputs.withdrawAmount > 0) {
            const amt = Math.min(inputs.withdrawAmount, balance);
            balance -= amt;
            withdrawn += amt;
        }
        result.days.push(d);
        result.balances.push(balance);
        result.principalsOnly.push(inputs.amount);
        result.contributionsOnly.push(contributed - withdrawn);
    }
    return result;
}

function buildChartDatasets(mainProj, inputs, sensitivity) {
    const ds = [
        {
            label: 'Balance',
            data: mainProj.balances,
            borderColor: 'rgba(255,255,255,0.95)',
            backgroundColor: 'rgba(255,255,255,0.12)',
            tension: 0.18,
        },
    ];
    if (inputs.showSensitivity && sensitivity > 0) {
        const up = project(inputs.customDays, inputs, +sensitivity);
        const down = project(inputs.customDays, inputs, -sensitivity);
        ds.push({ label: `+${sensitivity.toFixed(2)}pp`, data: up.balances, borderColor: 'rgba(255,255,255,0.6)', borderDash: [6, 4], tension: 0.18 });
        ds.push({ label: `-${sensitivity.toFixed(2)}pp`, data: down.balances, borderColor: 'rgba(255,255,255,0.6)', borderDash: [6, 4], tension: 0.18 });
    }
    return ds;
}

function renderChart(proj, inputs) {
    const ctx = document.getElementById('balanceChart');
    if (!ctx) return;
    const data = {
        labels: proj.days.map(d => d),
        datasets: buildChartDatasets(proj, inputs, inputs.sensitivityRange),
    };
    if (chart) {
        chart.data = data;
        chart.options.scales.y.ticks.callback = (v) => formatCurrency(v);
        chart.update();
        return;
    }
    chart = new Chart(ctx, {
        type: 'line',
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Days', color: '#fff' }, ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.15)' } },
                y: { title: { display: true, text: 'Balance', color: '#fff' }, ticks: { color: '#fff', callback: (v) => formatCurrency(v) }, grid: { color: 'rgba(255,255,255,0.15)' } },
            },
            plugins: {
                legend: { labels: { color: '#fff' } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } },
            },
        },
    });
}

function updateProfits() {
    const inputs = getInputs();
    updateApyDisplay();
    // 1 day and 1 year projections
    const projDay = project(1, inputs);
    const projYear = project(365, inputs);
    const startVal = inputs.amount;
    const endDay = projDay.balances[projDay.balances.length - 1];
    const endYear = projYear.balances[projYear.balances.length - 1];
    const netContribDay = projDay.contributionsOnly[projDay.contributionsOnly.length - 1] || 0;
    const netContribYear = projYear.contributionsOnly[projYear.contributionsOnly.length - 1] || 0;
    const profitDay = endDay - startVal - netContribDay;
    const profitYear = endYear - startVal - netContribYear;
    document.getElementById('profitDay').textContent = formatCurrency(profitDay);
    document.getElementById('profitYear').textContent = formatCurrency(profitYear);
}

function liveAprNow() {
    const inputs = getInputs();
    const schedule = parseAprSchedule(inputs.aprSchedule);
    const apr = schedule.length ? schedule[0].apr : inputs.apr;
    const net = effectiveNetApr(apr, inputs);
    return net;
}

function updatePrincipal(nowMs) {
    if (!running) return;
    const elapsedSec = initialElapsedSec + (nowMs - startTimeMs) / 1000;
    const years = elapsedSec / secondsPerYear;
    const inputs = getInputs();
    const netApr = liveAprNow();
    const n = compPeriodsPerYear(inputs.compounding);
    let value;
    if (n === 'continuous') {
        value = inputs.amount * Math.exp(netApr / 100 * years);
    } else {
        value = inputs.amount * Math.pow(1 + netApr / 100 / n, n * years);
    }
    currentValue = value;
    document.getElementById('principal').textContent = formatCurrencyWithDecimals(currentValue, 3);
    animationHandle = requestAnimationFrame(updatePrincipal);
}

function start() {
    if (running) return;
    initialElapsedSec = 0;
    startTimeMs = performance.now();
    const inputs = getInputs();
    document.getElementById('principal').textContent = formatCurrencyWithDecimals(inputs.amount, 3);
    const netApr = liveAprNow();
    document.getElementById('aprDisplay').textContent = `Earning ${netApr.toFixed(2)}% APR (net)`;
    updateProfits();
    // Projection and chart
    const proj = project(inputs.customDays, inputs);
    renderChart(proj, inputs);
    document.getElementById('apr-form').style.display = 'none';
    document.getElementById('display').style.display = 'flex';
    running = true;
    document.getElementById('stop').disabled = false;
    document.getElementById('start').disabled = true;
    animationHandle = requestAnimationFrame(updatePrincipal);
}

function stop() {
    if (!running) return;
    if (animationHandle) cancelAnimationFrame(animationHandle);
    running = false;
    // Save elapsed time so resume works
    initialElapsedSec += (performance.now() - startTimeMs) / 1000;
    // Restore default CSS display (grid) by clearing inline style
    document.getElementById('apr-form').style.display = '';
    document.getElementById('display').style.display = 'none';
    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
}

function resetState() {
    if (animationHandle) cancelAnimationFrame(animationHandle);
    running = false;
    initialElapsedSec = 0;
    currentValue = 0;
    chart = null;
    const chartCanvas = document.getElementById('balanceChart');
    if (chartCanvas) {
        const parent = chartCanvas.parentNode;
        chartCanvas.replaceWith(chartCanvas.cloneNode(true));
    }
    document.getElementById('principal').textContent = '$0.0000';
    document.getElementById('aprDisplay').textContent = 'Earning 0.00% APR';
    document.getElementById('profitYear').textContent = '$0.0000';
    document.getElementById('profitDay').textContent = '$0.0000';
    // Restore default CSS display (grid) by clearing inline style
    document.getElementById('apr-form').style.display = '';
    document.getElementById('display').style.display = 'none';
    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
}

function attachHorizonButtons() {
    document.querySelectorAll('[data-horizon]')?.forEach(btn => {
        btn.addEventListener('click', () => {
            const days = parseInt(btn.getAttribute('data-horizon'), 10) || 365;
            const input = document.getElementById('customDays');
            input.value = String(days);
            updateProfits();
        });
    });
}

function exportCsv() {
    const inputs = getInputs();
    const proj = project(inputs.customDays, inputs);
    const lines = ['day,balance,contributed'];
    for (let i = 0; i < proj.days.length; i += 1) {
        lines.push([proj.days[i], proj.balances[i], proj.contributionsOnly[i]].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projection.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function serializeToQuery() {
    const inputs = getInputs();
    const params = new URLSearchParams();
    Object.entries(inputs).forEach(([k, v]) => {
        if (typeof v === 'boolean') params.set(k, v ? '1' : '0');
        else params.set(k, String(v));
    });
    return `${location.origin}${location.pathname}?${params.toString()}`;
}

async function shareLink() {
    const link = serializeToQuery();
    try {
        await navigator.clipboard.writeText(link);
        alert('Link copied to clipboard');
    } catch (e) {
        prompt('Copy this link:', link);
    }
}

function loadFromQuery() {
    const url = new URL(location.href);
    const q = url.searchParams;
    const getBool = (k) => q.get(k) === '1';
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
    const map = ['amount','rate','compounding','contributionAmount','contributionFrequency','withdrawAmount','withdrawFrequency','currency','inflationRate','managementFee','performanceFee','taxRate','customDays','aprSchedule','sensitivityRange'];
    map.forEach(k => { if (q.has(k)) setVal(k === 'rate' ? 'rate' : k, q.get(k)); });
    if (q.has('showReal')) setCheck('showReal', getBool('showReal'));
    if (q.has('showSensitivity')) setCheck('showSensitivity', getBool('showSensitivity'));
}

function saveScenario() {
    const name = document.getElementById('scenarioName').value.trim();
    if (!name) {
        alert('Enter a scenario name');
        return;
    }
    const inputs = getInputs();
    const all = JSON.parse(localStorage.getItem('scenarios') || '{}');
    all[name] = inputs;
    localStorage.setItem('scenarios', JSON.stringify(all));
    populateScenarioList();
}

function deleteScenario() {
    const name = document.getElementById('scenarioName').value.trim();
    const all = JSON.parse(localStorage.getItem('scenarios') || '{}');
    if (name in all) {
        delete all[name];
        localStorage.setItem('scenarios', JSON.stringify(all));
        populateScenarioList();
    }
}

function populateScenarioList() {
    const list = document.getElementById('scenarioList');
    if (!list) return;
    const all = JSON.parse(localStorage.getItem('scenarios') || '{}');
    list.innerHTML = '';
    Object.keys(all).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        list.appendChild(opt);
    });
}

function loadScenario() {
    const list = document.getElementById('scenarioList');
    const name = list?.value;
    if (!name) return;
    const all = JSON.parse(localStorage.getItem('scenarios') || '{}');
    const s = all[name];
    if (!s) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
    Object.entries(s).forEach(([k, v]) => {
        if (typeof v === 'boolean') setCheck(k, v);
        else setVal(k === 'apr' ? 'rate' : k, v);
    });
    updateProfits();
}

function compareSelected() {
    const inputs = getInputs();
    const all = JSON.parse(localStorage.getItem('scenarios') || '{}');
    const list = document.getElementById('scenarioList');
    const selected = Array.from(list.selectedOptions).map(o => o.value);
    const ctx = document.getElementById('balanceChart');
    if (!ctx) return;
    const baseProj = project(inputs.customDays, inputs);
    const datasets = buildChartDatasets(baseProj, inputs, inputs.sensitivityRange);
    selected.forEach(name => {
        const s = all[name];
        if (!s) return;
        const proj = project(inputs.customDays, { ...s, apr: s.apr ?? s.rate });
        datasets.push({ label: `Scenario: ${name}`, data: proj.balances, borderColor: 'rgba(255,255,255,0.3)', tension: 0.18 });
    });
    if (!chart) {
        chart = new Chart(ctx, {
            type: 'line', data: { labels: baseProj.days, datasets }, options: { plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#fff', callback: (v)=>formatCurrency(v) } }, x: { ticks: { color: '#fff' } } } }
        });
    } else {
        chart.data.labels = baseProj.days;
        chart.data.datasets = datasets;
        chart.update();
    }
}

function solveGoal() {
    const target = parseFloat(document.getElementById('targetBalance').value) || 0;
    const variable = document.getElementById('goalVariable').value;
    const inputs = getInputs();
    const resEl = document.getElementById('goalResult');
    if (target <= 0) { resEl.textContent = 'Enter a positive target.'; return; }

    if (variable === 'time') {
        // iterate days up to 50 years
        const maxDays = 365 * 50;
        let low = 0, high = maxDays, ans = -1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const proj = project(mid, inputs);
            const val = proj.balances[proj.balances.length - 1];
            if (val >= target) { ans = mid; high = mid - 1; } else { low = mid + 1; }
        }
        resEl.textContent = ans >= 0 ? `Time to target: ${ans} days (~${(ans/30.4375).toFixed(1)} months)` : 'Unreachable within 50 years';
        return;
    }
    if (variable === 'apr') {
        // binary search APR 0..200
        let low = 0, high = 200, ans = -1;
        for (let i = 0; i < 40; i += 1) {
            const mid = (low + high) / 2;
            const proj = project(inputs.customDays, { ...inputs, apr: mid });
            const val = proj.balances[proj.balances.length - 1];
            if (val >= target) { ans = mid; high = mid; } else { low = mid; }
        }
        resEl.textContent = ans >= 0 ? `Required APR: ${ans.toFixed(2)}%` : 'APR too high to estimate';
        return;
    }
    if (variable === 'contribution') {
        // binary search contribution 0..1e6
        let low = 0, high = 1_000_000, ans = -1;
        for (let i = 0; i < 40; i += 1) {
            const mid = (low + high) / 2;
            const proj = project(inputs.customDays, { ...inputs, contributionAmount: mid });
            const val = proj.balances[proj.balances.length - 1];
            if (val >= target) { ans = mid; high = mid; } else { low = mid; }
        }
        resEl.textContent = ans >= 0 ? `Required contribution: ${formatCurrency(ans)}/${inputs.contributionFrequency || 'period'}` : 'Contribution too large to estimate';
    }
}

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function attachEvents() {
    document.getElementById('start').addEventListener('click', () => { initialElapsedSec = 0; start(); });
    document.getElementById('stop').addEventListener('click', stop);
    document.getElementById('goBack')?.addEventListener('click', stop);
    document.getElementById('reset')?.addEventListener('click', () => {
        // Clear a subset of inputs
        ['amount','rate','contributionAmount','withdrawAmount','inflationRate','managementFee','performanceFee','taxRate','customDays','aprSchedule','scenarioName','targetBalance','sensitivityRange'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('contributionFrequency').value = 'none';
        document.getElementById('withdrawFrequency').value = 'none';
        document.getElementById('compounding').value = 'monthly';
        document.getElementById('currency').value = 'USD';
        document.getElementById('showReal').checked = false;
        document.getElementById('showSensitivity').checked = false;
        resetState();
    });
    // Dynamic updates
    ['amount','rate','compounding','contributionAmount','contributionFrequency','withdrawAmount','withdrawFrequency','currency','inflationRate','managementFee','performanceFee','taxRate','customDays','aprSchedule','sensitivityRange'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateProfits);
        el.addEventListener('change', updateProfits);
    });
    document.getElementById('showReal').addEventListener('change', updateProfits);
    document.getElementById('showSensitivity').addEventListener('change', updateProfits);
    // Presets
    attachHorizonButtons();
    // CSV / Share
    document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
    document.getElementById('shareLink')?.addEventListener('click', shareLink);
    // Scenarios
    document.getElementById('saveScenario')?.addEventListener('click', saveScenario);
    document.getElementById('deleteScenario')?.addEventListener('click', deleteScenario);
    document.getElementById('loadScenario')?.addEventListener('click', loadScenario);
    document.getElementById('compareSelected')?.addEventListener('click', compareSelected);
    // Goal seek
    document.getElementById('goalSolve')?.addEventListener('click', solveGoal);
    // Pause animation when hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && running) {
            if (animationHandle) cancelAnimationFrame(animationHandle);
        } else if (!document.hidden && running) {
            startTimeMs = performance.now();
            animationHandle = requestAnimationFrame(updatePrincipal);
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    loadFromQuery();
    updateApyDisplay();
    updateProfits();
    populateScenarioList();
    attachEvents();
    registerSW();
});