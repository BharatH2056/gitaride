const fs = require('fs');
const path = require('path');

const root = __dirname;

// ─── helpers ────────────────────────────────────────────────────────────────

function patch(file, fn) {
  const full = path.join(root, file);
  let src = fs.readFileSync(full, 'utf8');
  const out = fn(src);
  fs.writeFileSync(full, out, 'utf8');
  console.log('✓ patched', file);
}

// Convert fetch("/api/xxx"  →  fetch(`${API_BASE}/api/xxx`
// Also handles fetch("/api/xxx",  (with trailing comma/space before next arg)
function fixStringFetch(src) {
  return src.replace(/fetch\("(\/api\/[^"]+)"/g, (_, p) => `fetch(\`\${API_BASE}${p}\``);
}

// Convert fetch(`/api/xxx  →  fetch(`${API_BASE}/api/xxx
function fixTemplateFetch(src) {
  return src.replace(/fetch\(`(\/api\/)/g, 'fetch(`${API_BASE}$1');
}

// Fix socket connection
function fixSocket(src) {
  return src.replace(
    /io\(window\.location\.origin\)/g,
    'io(import.meta.env.VITE_API_URL || window.location.origin)'
  );
}

// ─── App.tsx ────────────────────────────────────────────────────────────────

patch('src/App.tsx', (src) => {
  // 1. Add API_BASE module-level constant before INDIA_CENTER
  src = src.replace(
    'const INDIA_CENTER',
    "const API_BASE = import.meta.env.VITE_API_URL || '';\n\nconst INDIA_CENTER"
  );

  // 2. Fix fetch calls
  src = fixStringFetch(src);
  src = fixTemplateFetch(src);

  // 3. Fix socket connection
  src = fixSocket(src);

  return src;
});

// ─── DriverDashboard.tsx ────────────────────────────────────────────────────

patch('src/components/DriverDashboard.tsx', (src) => {
  // 1. Add API_BASE constant after the last import line (before first blank line after imports)
  src = src.replace(
    'const INDIA_CENTER',
    "const API_BASE = import.meta.env.VITE_API_URL || '';\n\nconst INDIA_CENTER"
  );

  // 2. Fix fetch calls
  src = fixStringFetch(src);
  src = fixTemplateFetch(src);

  // 3. Fix socket connection
  src = fixSocket(src);

  return src;
});

// ─── DriverRegistration.tsx ─────────────────────────────────────────────────
// (has one fetch("/api/driver/profile") call)

patch('src/components/DriverRegistration.tsx', (src) => {
  // Only patch if API_BASE not already present
  if (src.includes('API_BASE')) return src;

  // Add API_BASE before the component function
  src = src.replace(
    /^(export default function)/m,
    "const API_BASE = import.meta.env.VITE_API_URL || '';\n\n$1"
  );

  src = fixStringFetch(src);
  src = fixTemplateFetch(src);

  return src;
});

console.log('\nAll done. VITE_API_URL is now used everywhere.');
