// Web Worker: posts a "tick" at ~60 Hz. Worker timers are not throttled like
// timers/animation frames in a hidden tab, so the host can keep simulating.
let timer = null;
onmessage = (e) => {
  clearInterval(timer);
  timer = e.data === 'start' ? setInterval(() => postMessage(0), 1000 / 60) : null;
};
