export const cliConfig = {
  output: { target: 'node' as const },
  tools: {
    // The TUI components import hooks from 'react' but not React itself, as the
    // `react-jsx` tsconfig setting allows. SWC defaults to the classic
    // `React.createElement` transform, which throws `React is not defined` the
    // moment a TUI renders, so compile JSX with the automatic runtime.
    swc: { jsc: { transform: { react: { runtime: 'automatic' as const } } } },
  },
};
