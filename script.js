let running = false;
let amount = 0;
let rate = 0;
let currentValue = 0;
let interval = null;
let startTime = 0;
let initialTime = 0;

const secondsPerYear = 365 * 24 * 60 * 60;
const secondsPerDay = 24 * 60 * 60;

function formatCurrency(val) {
    // Format with commas and 4 decimals
    return '$' + Number(val).toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4});
}

function updatePrincipal() {
    const elapsed = (Date.now() - startTime) / 1000 + initialTime; // seconds
    currentValue = amount * Math.pow(1 + rate / 100 / secondsPerYear, elapsed);
    document.getElementById('principal').textContent = formatCurrency(currentValue);
}

function updateProfits() {
    // Profit after 1 year
    const futureValue = amount * Math.pow(1 + rate / 100 / secondsPerYear, secondsPerYear);
    const profitYear = futureValue - amount;
    document.getElementById('profitYear').textContent = formatCurrency(profitYear);
    // Profit per day
    const valuePerDay = amount * Math.pow(1 + rate / 100 / secondsPerYear, secondsPerDay);
    const profitDay = valuePerDay - amount;
    document.getElementById('profitDay').textContent = formatCurrency(profitDay);
}

function start() {
    if (running) return;
    amount = parseFloat(document.getElementById('amount').value) || 0;
    rate = parseFloat(document.getElementById('rate').value) || 0;
    currentValue = amount;
    // Reset time if starting fresh
    if (!initialTime) initialTime = 0;
    startTime = Date.now();
    document.getElementById('principal').textContent = formatCurrency(amount);
    document.getElementById('aprDisplay').textContent = `Earning ${rate.toFixed(2)}% APR`;
    updateProfits();
    document.getElementById('apr-form').style.display = 'none';
    document.getElementById('display').style.display = 'flex';
    interval = setInterval(updatePrincipal, 1000/30); // update 30 times per second for smoothness
    running = true;
    document.getElementById('stop').disabled = false;
    document.getElementById('start').disabled = true;
}

function stop() {
    if (!running) return;
    clearInterval(interval);
    running = false;
    // Save elapsed time so resume works
    initialTime += (Date.now() - startTime) / 1000;
    document.getElementById('apr-form').style.display = 'flex';
    document.getElementById('display').style.display = 'none';
    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
}

function resetState() {
    running = false;
    initialTime = 0;
    clearInterval(interval);
    document.getElementById('principal').textContent = '$0.0000';
    document.getElementById('aprDisplay').textContent = 'Earning 0.00% APR';
    document.getElementById('profitYear').textContent = '$0.0000';
    document.getElementById('profitDay').textContent = '$0.0000';
    document.getElementById('apr-form').style.display = 'flex';
    document.getElementById('display').style.display = 'none';
    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
}

document.getElementById('start').addEventListener('click', () => {
    initialTime = 0;
    start();
});
document.getElementById('stop').addEventListener('click', stop);
window.addEventListener('DOMContentLoaded', resetState);
// Update profits when inputs change
['amount', 'rate'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateProfits);
});
// Go Back button logic
const goBackBtn = document.getElementById('goBack');
if (goBackBtn) {
    goBackBtn.addEventListener('click', stop);
}
