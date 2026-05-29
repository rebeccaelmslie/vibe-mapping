// Expo's bundler understands CSS imports; bare `tsc` needs these ambient
// declarations so `pnpm typecheck` passes for the template's styling.
declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
