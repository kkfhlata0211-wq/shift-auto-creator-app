/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shift: {
          day: '#e0f2fe',       // 日勤
          early: '#fef3c7',     // 早番
          late: '#ffedd5',      // 遅番
          night: '#ede9fe',     // 夜勤
          nightNext: '#f1f5f9', // 明番
          holiday: '#fee2e2',   // 公休
          paid: '#dcfce7',      // 有休
        }
      }
    },
  },
  plugins: [],
}
