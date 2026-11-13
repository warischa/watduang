// `three` ships no type declarations and its typings package is not installed, so every import from it is
// typed `any` here (a shorthand ambient module). A shorthand module's names are values only: write an
// instance type as `InstanceType<typeof Scene>`, which is `any` today and the real class type once the
// typings package is added. Delete this file when it is.
declare module 'three';
