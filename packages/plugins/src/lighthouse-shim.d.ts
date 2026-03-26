declare module 'lighthouse/core/index.cjs' {
  import type lighthouse from 'lighthouse';
  const runLighthouse: typeof lighthouse;
  export default runLighthouse;
}

