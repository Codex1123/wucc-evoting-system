import { useEffect, useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('votechain-theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('votechain-theme', theme);
  }, [theme]);

  return { theme, setTheme, toggleTheme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')) };
}
