// The build imports .css files as text (esbuild --loader:.css=text).
declare module '*.css' {
  const css: string;
  export default css;
}
