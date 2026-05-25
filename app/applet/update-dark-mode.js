const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  { from: /\bbg-white(?!(\/| dark))/g, to: 'bg-white dark:bg-zinc-950' },
  { from: /\btext-zinc-950(?! dark)/g, to: 'text-zinc-950 dark:text-zinc-50' },
  { from: /\bbg-zinc-50(?!(\/| dark))/g, to: 'bg-zinc-50 dark:bg-zinc-900/50' },
  { from: /\bbg-zinc-100(?!(\/| dark))/g, to: 'bg-zinc-100 dark:bg-zinc-800' },
  { from: /\bborder-zinc-100(?! dark)/g, to: 'border-zinc-100 dark:border-zinc-800' },
  { from: /\bborder-zinc-200(?! dark)/g, to: 'border-zinc-200 dark:border-zinc-700' },
  { from: /\btext-zinc-400(?! dark)/g, to: 'text-zinc-400 dark:text-zinc-400' },
  { from: /\btext-zinc-500(?! dark)/g, to: 'text-zinc-500 dark:text-zinc-400' },
  { from: /\btext-zinc-600(?! dark)/g, to: 'text-zinc-600 dark:text-zinc-300' },
  { from: /\btext-zinc-700(?! dark)/g, to: 'text-zinc-700 dark:text-zinc-200' },
  { from: /\btext-zinc-800(?! dark)/g, to: 'text-zinc-800 dark:text-zinc-100' },
  { from: /\btext-zinc-900(?! dark)/g, to: 'text-zinc-900 dark:text-zinc-100' },
  { from: /\bbg-zinc-950(?! dark)/g, to: 'bg-zinc-950 dark:bg-zinc-50 dark:text-zinc-900' } // for primary buttons
];

replacements.forEach(r => {
  content = content.replace(r.from, r.to);
});

// Avoid double application of text classes inside bg-zinc-950 replacements
content = content.replace(/dark:text-zinc-900 text-white/g, 'text-white dark:text-zinc-900');
content = content.replace(/text-white dark:text-zinc-900 dark:text-zinc-50/g, 'text-white dark:text-zinc-900');

fs.writeFileSync('src/App.tsx', content);
console.log('Updated dark mode classes in App.tsx');
