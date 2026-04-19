// --- Fraction arithmetic (all fractions kept in lowest terms) ---

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

export function frac(num, den = 1) {
  if (den === 0) throw new Error('Division by zero');
  if (num === 0) return { num: 0, den: 1 };
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(Math.abs(num), den);
  return { num: num / g, den: den / g };
}

export function addF(a, b) {
  return frac(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function mulF(a, b) {
  return frac(a.num * b.num, a.den * b.den);
}

export function negF(a) {
  return { num: -a.num, den: a.den };
}

export function isZeroF(f) { return f.num === 0; }
export function absEqOneF(f) { return Math.abs(f.num) === f.den; }
export function isPosOneF(f) { return f.num > 0 && f.num === f.den; }

// Format a fraction as a display string
// showPlus: prepend '+' when positive
export function fracStr(f, showPlus = false) {
  const neg = f.num < 0;
  const sign = neg ? '-' : (showPlus ? '+' : '');
  const n = Math.abs(f.num);
  if (f.den === 1) return `${sign}${n}`;
  return `${sign}${n}/${f.den}`;
}

// Format a term for display  (coefficient * x  OR  plain constant)
export function termLabel(coeff, isVar) {
  const neg = coeff.num < 0;
  const n = Math.abs(coeff.num);
  const d = coeff.den;

  if (!isVar) {
    // constant
    if (d === 1) return `${neg ? '-' : ''}${n}`;
    return `${neg ? '-' : ''}${n}/${d}`;
  }

  // variable
  if (d === 1) {
    if (n === 1) return `${neg ? '-' : ''}x`;
    return `${neg ? '-' : ''}${n}x`;
  }
  // fractional coefficient  ->  (n/d)x  or  x/d when n===1
  if (n === 1) return `${neg ? '-' : ''}x/${d}`;
  return `${neg ? '-' : ''}(${n}/${d})x`;
}

// Sign label between adjacent terms  (+3, -5, +x ...)
export function signLabel(coeff) {
  return coeff.num >= 0 ? '+' : '-';
}

// Unsigned magnitude label (for term inside equation, sign shown separately)
// isVar can be boolean (legacy) or a string varName like 'x' or 'y'
export function termMagLabel(coeff, isVar) {
  const n = Math.abs(coeff.num);
  const d = coeff.den;
  const varLabel = typeof isVar === 'string' ? isVar : (isVar ? 'x' : null);
  if (!varLabel) {
    return d === 1 ? `${n}` : `${n}/${d}`;
  }
  if (d === 1) {
    if (n === 1) return varLabel;
    return `${n}${varLabel}`;
  }
  if (n === 1) return `${varLabel}/${d}`;
  return `(${n}/${d})${varLabel}`;
}
