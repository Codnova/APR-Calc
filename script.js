let running = false;
let amount = 0;
let rate = 0;
let currentValue = 0;
let values = [];
let interval = null;
let startTime = 0;
let futureValue = 0;
const secondsPerYear = 365 * 24 * 60 * 60;

function drawChart() {
    const canvas = document.getElementById('chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (values.length === 0) return;
    const maxVal = Math.max(...values);
    const scaleY = canvas.height / maxVal;
    const stepX = canvas.width / (values.length - 1 || 1);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - values[0] * scaleY);
    for (let i = 1; i < values.length; i++) {
        ctx.lineTo(stepX * i, canvas.height - values[i] * scaleY);
    }
    ctx.strokeStyle = 'blue';
    ctx.stroke();
}

function update() {
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    currentValue = amount * Math.pow(1 + rate / 100 / secondsPerYear, elapsed);
    document.getElementById('value').textContent = currentValue.toFixed(2);
    document.getElementById('profit').textContent = (currentValue - amount).toFixed(2);
    values.push(currentValue);
    if (values.length > 60) values.shift();
    drawChart();
}

function start() {
    if (running) return;
    amount = parseFloat(document.getElementById('amount').value) || 0;
    rate = parseFloat(document.getElementById('rate').value) || 0;
    currentValue = amount;
    futureValue = amount * Math.pow(1 + rate / 100 / secondsPerYear, secondsPerYear);
    startTime = Date.now();
    values = [currentValue];
    document.getElementById('value').textContent = currentValue.toFixed(2);
    document.getElementById('profit').textContent = '0.00';
    document.getElementById('future').textContent = futureValue.toFixed(2);
    drawChart();
    interval = setInterval(update, 1000);
    running = true;
    document.getElementById('stop').disabled = false;
}

function stop() {
    if (!running) return;
    clearInterval(interval);
    running = false;
    document.getElementById('stop').disabled = true;
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('stop').addEventListener('click', stop);
