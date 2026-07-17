import React, { useEffect, useRef, useState } from 'react';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// Counts from the previous value to the new one over ~600ms. Purely
// cosmetic - a static number is fine functionally, this just makes the
// dashboard feel alive when a number actually changes.
export default function AnimatedNumber({ value, format = usd, duration = 650, className }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = typeof value === 'number' ? value : 0;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
